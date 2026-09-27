import 'dotenv/config';
import express from 'express';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
const imagesDir = join(dataDir, 'images');
const audioDir = join(dataDir, 'audio');
const port = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function ensureMediaDirs() {
    await mkdir(imagesDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
}

function getFileExtension(filename, fallback) {
    const match = typeof filename === 'string' ? filename.match(/\.([a-zA-Z0-9]+)$/) : null;
    return match?.[1] ? `.${match[1].toLowerCase()}` : fallback;
}

function parseFile(file) {
    return file && typeof file.name === 'string' && typeof file.data === 'string' && file.name && file.data ? file : null;
}

function publicSong(req, song, detail = false) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return {
        id: song.id,
        archived: song.archived,
        title: song.title,
        subtitle: song.subtitle,
        composer: song.composer,
        measureCount: song.measure_count,
        elapsedTime: song.elapsed_time,
        timeElapsed: song.elapsed_time,
        measures: (song.measures ?? []).map((measure) => ({
            number: measure.number,
            initial: Number(measure.initial),
            current: Number(measure.initial),
            target: Number(measure.target),
            ignoreTempo: measure.ignore_tempo,
            mode: measure.mode,
            elapsedTime: measure.elapsed_time,
            timeElapsed: measure.elapsed_time,
            ...(detail ? { events: (measure.practice_events ?? []).map((event) => ({
                timestamp: Number(event.timestamp), type: event.type,
                ...(event.value === null ? {} : { value: Number(event.value) }), outcome: event.outcome,
            })) } : {
                progress: measure.event_count ? (measure.last_metronome_bpm && measure.target
                    ? (Number(measure.last_metronome_bpm) / Number(measure.target))
                    : measure.ignore_tempo ? 1 : 0)
                    * (Number(measure.success_count) / 50)
                    * Math.pow(0.98, measure.last_event_at ? Math.max(0, Math.floor((Date.now() / 1000 - Number(measure.last_event_at)) / 86400)) : 0) : 0,
                averageTempo: measure.last_metronome_bpm,
                accuracy: measure.event_count ? (Number(measure.success_count) / 50) * 100 : 0,
                lastPractice: measure.last_event_at,
            }),
        })),
        imageUrl: song.image ? `${baseUrl}/images/${song.image}` : null,
        audioUrl: song.audio ? `${baseUrl}/audio/${song.audio}` : null,
    };
}

const measureColumns = 'id,number,initial,target,ignore_tempo,mode,elapsed_time,last_event_at,last_metronome_bpm,success_count,event_count';
const detailMeasureColumns = `${measureColumns},practice_events(timestamp,type,value,outcome)`;

async function getSongs(detail = false, id = null) {
    let query = supabase.from('songs')
        .select(`id,archived,title,subtitle,composer,image,audio,measure_count,elapsed_time,measures(${detail ? detailMeasureColumns : measureColumns})`)
        .order('created_at');
    if (id) query = query.eq('id', id).single();
    const { data, error } = await query;
    if (error) {
        if (id && error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

async function getSongOr404(id, res) {
    const song = await getSongs(true, id);
    if (!song) res.status(404).json({ error: 'Song not found' });
    return song;
}

async function saveMedia(file, directory, fallback) {
    if (!file) return '';
    const filename = `${randomUUID()}${getFileExtension(file.name, fallback)}`;
    await writeFile(join(directory, filename), Buffer.from(file.data, 'base64'));
    return filename;
}

async function removeMedia(directory, filename) {
    if (!filename) return;
    try { await unlink(join(directory, filename)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function updateMeasureStats(measureId) {
    const { data, error } = await supabase.from('practice_events').select('timestamp,type,value,outcome').eq('measure_id', measureId).order('timestamp', { ascending: false });
    if (error) throw error;
    const events = data ?? [];
    const latest = events[0];
    const metronome = events.find((event) => event.type === 'metronome');
    const { error: updateError } = await supabase.from('measures').update({
        last_event_at: latest?.timestamp ?? null,
        last_metronome_bpm: metronome?.value ?? null,
        success_count: events.slice(0, 50).filter((event) => event.outcome === 'success').length,
        event_count: events.length,
    }).eq('id', measureId);
    if (updateError) throw updateError;
}

const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: '100mb' }));
app.use('/images', express.static(imagesDir));
app.use('/audio', express.static(audioDir));

app.get('/songs', async (req, res) => {
    try { res.json({ songs: (await getSongs()).map((song) => publicSong(req, song)) }); }
    catch (error) { console.error(error); res.status(500).json({ error: 'Failed to retrieve songs' }); }
});

app.get('/songs/:id', async (req, res) => {
    try {
        const song = await getSongOr404(req.params.id, res);
        if (song) res.json({ song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to retrieve song' }); }
});

app.post('/songs/create', async (req, res) => {
    try {
        const body = req.body ?? {};
        const measureCount = Number(body.measureCount);
        const initial = Number(body.initialTempo);
        const target = Number(body.targetTempo);
        if (!body.title?.trim() || !body.composer?.trim()) return res.status(400).json({ error: 'Title and composer are required' });
        if (!Number.isInteger(measureCount) || measureCount < 1 || !Number.isFinite(initial) || !Number.isFinite(target)) return res.status(400).json({ error: 'Invalid measure or tempo values' });
        await ensureMediaDirs();
        const image = await saveMedia(parseFile(body.imageFile), imagesDir, '.jpg');
        const audio = await saveMedia(parseFile(body.audioFile), audioDir, '.mp3');
        const id = randomUUID();
        const { error: songError } = await supabase.from('songs').insert({ id, title: body.title.trim(), subtitle: body.subtitle?.trim() ?? '', composer: body.composer.trim(), image, audio, measure_count: measureCount });
        if (songError) throw songError;
        const measures = Array.from({ length: measureCount }, (_, index) => ({ song_id: id, number: index + 1, initial, target }));
        const { error: measureError } = await supabase.from('measures').insert(measures);
        if (measureError) throw measureError;
        const song = await getSongs(true, id);
        res.status(201).json({ song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to create song' }); }
});

app.post('/songs/:id/update', async (req, res) => {
    try {
        const existing = await getSongOr404(req.params.id, res);
        if (!existing) return;
        const body = req.body ?? {};
        const patch = {};
        for (const field of ['title', 'subtitle', 'composer', 'archived']) if (body[field] !== undefined) patch[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
        await ensureMediaDirs();
        if (parseFile(body.imageFile)) { patch.image = await saveMedia(parseFile(body.imageFile), imagesDir, '.jpg'); await removeMedia(imagesDir, existing.image); }
        if (parseFile(body.audioFile)) { patch.audio = await saveMedia(parseFile(body.audioFile), audioDir, '.mp3'); await removeMedia(audioDir, existing.audio); }
        const { error } = await supabase.from('songs').update(patch).eq('id', req.params.id);
        if (error) throw error;
        const song = await getSongs(true, req.params.id);
        res.json({ song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to update song' }); }
});

app.patch('/songs/:id/measures/:measureNumber', async (req, res) => {
    try {
        const { data: measure, error } = await supabase.from('measures').select('id').eq('song_id', req.params.id).eq('number', Number(req.params.measureNumber)).single();
        if (error || !measure) return res.status(404).json({ error: 'Measure not found' });
        const patch = {};
        for (const field of ['initial', 'target', 'ignore_tempo', 'mode']) if (req.body[field] !== undefined) patch[field] = req.body[field];
        const { error: updateError } = await supabase.from('measures').update(patch).eq('id', measure.id);
        if (updateError) throw updateError;
        const song = await getSongs(true, req.params.id);
        res.json({ song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to update measure' }); }
});

app.post('/songs/:id/measures/:measureNumber/events', async (req, res) => {
    try {
        const body = req.body ?? {};
        const numbers = Array.from(new Set((body.measureNumbers ?? [req.params.measureNumber]).map(Number).filter((number) => Number.isInteger(number) && number > 0)));
        if (!numbers.length || !['success', 'failure'].includes(body.outcome)) return res.status(400).json({ error: 'Invalid event' });
        if (body.type === 'metronome' && (!Number.isFinite(Number(body.bpm)) || Number(body.bpm) < 1)) return res.status(400).json({ error: 'Invalid BPM' });
        const timestamp = Math.floor(Date.now() / 1000);
        const elapsedSeconds = Math.max(0, Math.ceil(Number(body.elapsedSeconds) || 0));
        for (const number of numbers) {
            const { data: measure, error } = await supabase.from('measures').select('id,elapsed_time').eq('song_id', req.params.id).eq('number', number).single();
            if (error || !measure) return res.status(404).json({ error: `Measure ${number} not found` });
            const { error: eventError } = await supabase.from('practice_events').insert({ measure_id: measure.id, timestamp, type: body.type ?? 'metronome', value: body.type === 'metronome' ? Number(body.bpm) : null, outcome: body.outcome });
            if (eventError) throw eventError;
            const { error: elapsedError } = await supabase.from('measures').update({ elapsed_time: Number(measure.elapsed_time) + elapsedSeconds }).eq('id', measure.id);
            if (elapsedError) throw elapsedError;
            await updateMeasureStats(measure.id);
        }
        if (elapsedSeconds) {
            const song = await getSongs(true, req.params.id);
            const { error } = await supabase.from('songs').update({ elapsed_time: Number(song.elapsed_time) + elapsedSeconds }).eq('id', req.params.id);
            if (error) throw error;
        }
        const song = await getSongs(true, req.params.id);
        res.json({ measureNumbers: numbers, song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to add event' }); }
});

app.delete('/songs/:id', async (req, res) => {
    try {
        const song = await getSongOr404(req.params.id, res);
        if (!song) return;
        const { error } = await supabase.from('songs').delete().eq('id', req.params.id);
        if (error) throw error;
        await removeMedia(imagesDir, song.image); await removeMedia(audioDir, song.audio);
        res.json({ songs: (await getSongs()).map((entry) => publicSong(req, entry)) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to delete song' }); }
});

async function clearProgress(req, res, measureNumber = null) {
    const song = await getSongOr404(req.params.id, res);
    if (!song) return;
    const measures = measureNumber === null ? song.measures : song.measures.filter((measure) => measure.number === measureNumber);
    if (!measures.length) return res.status(404).json({ error: 'Measure not found' });
    for (const measure of measures) {
        const { data: row, error } = await supabase.from('measures').select('id').eq('song_id', req.params.id).eq('number', measure.number).single();
        if (error) throw error;
        const { error: eventError } = await supabase.from('practice_events').delete().eq('measure_id', row.id);
        if (eventError) throw eventError;
        const { error: measureError } = await supabase.from('measures').update({ elapsed_time: 0, last_event_at: null, last_metronome_bpm: null, success_count: 0, event_count: 0 }).eq('id', row.id);
        if (measureError) throw measureError;
    }
    if (measureNumber === null) { const { error } = await supabase.from('songs').update({ elapsed_time: 0 }).eq('id', req.params.id); if (error) throw error; }
    const updated = await getSongs(true, req.params.id);
    res.json({ song: publicSong(req, updated, true) });
}

app.post('/songs/:id/clear-progress', (req, res) => clearProgress(req, res));
app.post('/songs/:id/measures/:measureNumber/clear-progress', (req, res) => clearProgress(req, res, Number(req.params.measureNumber)));

app.delete('/songs/:id/measures/:measureNumber', async (req, res) => {
    try {
        const { error } = await supabase.from('measures').delete().eq('song_id', req.params.id).eq('number', Number(req.params.measureNumber));
        if (error) throw error;
        const { data: measures, error: listError } = await supabase.from('measures').select('number').eq('song_id', req.params.id).order('number');
        if (listError) throw listError;
        const { error: songError } = await supabase.from('songs').update({ measure_count: measures.length }).eq('id', req.params.id);
        if (songError) throw songError;
        const song = await getSongs(true, req.params.id);
        res.json({ song: publicSong(req, song, true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to delete measure' }); }
});

app.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Uploaded payload is too large' });
    next(error);
});

await ensureMediaDirs();
app.listen(port, '0.0.0.0', () => console.log(`PracticeApp backend listening on port ${port}`));
