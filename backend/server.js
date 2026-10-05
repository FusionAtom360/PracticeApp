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
const MAX_JSON_BODY = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_MEASURES = 1000;
const MAX_TEMPO = 400;
const MAX_EVENT_BATCH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_SUBTITLE_LENGTH = 300;
const MAX_COMPOSER_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function ensureMediaDirs() {
    await mkdir(imagesDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
}

function parseFile(file) {
    return file && typeof file.name === 'string' && typeof file.data === 'string' && typeof file.type === 'string' && file.name && file.data ? file : null;
}

function validateMedia(file, kind) {
    if (!file) return null;
    const encoded = file.data.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
        throw new Error(`Invalid ${kind} file encoding`);
    }
    const data = Buffer.from(encoded, 'base64');
    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (data.length === 0 || data.length > maxBytes) {
        throw new Error(`${kind} file exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`);
    }

    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isPng = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isGif = data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'));
    const isWebp = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    const isId3Audio = data.length >= 3 && data.subarray(0, 3).toString('ascii') === 'ID3';
    const isOgg = data.length >= 4 && data.subarray(0, 4).toString('ascii') === 'OggS';
    const isFlac = data.length >= 4 && data.subarray(0, 4).toString('ascii') === 'fLaC';
    const isWav = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WAVE';
    const isMp4 = data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp';

    if (kind === 'image') {
        if (isJpeg) return { data, extension: '.jpg' };
        if (isPng) return { data, extension: '.png' };
        if (isGif) return { data, extension: '.gif' };
        if (isWebp) return { data, extension: '.webp' };
    } else {
        if (isId3Audio) return { data, extension: '.mp3' };
        if (isOgg) return { data, extension: '.ogg' };
        if (isFlac) return { data, extension: '.flac' };
        if (isWav) return { data, extension: '.wav' };
        if (isMp4) return { data, extension: '.m4a' };
    }

    throw new Error(`Unsupported ${kind} file type`);
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
        measures: [...(song.measures ?? [])]
            .sort((first, second) => Number(first.number) - Number(second.number))
            .map((measure) => ({
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

async function saveMedia(file, directory, kind) {
    if (!file) return '';
    const validated = validateMedia(file, kind);
    const filename = `${randomUUID()}${validated.extension}`;
    await writeFile(join(directory, filename), validated.data, { flag: 'wx' });
    return filename;
}

async function removeMedia(directory, filename) {
    if (!filename) return;
    try { await unlink(join(directory, filename)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const app = express();
const requestCounts = new Map();
const rateLimitCleanup = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [key, entry] of requestCounts) {
        if (entry.startedAt < cutoff) requestCounts.delete(key);
    }
}, RATE_LIMIT_WINDOW_MS);
rateLimitCleanup.unref();
app.use((req, res, next) => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (req.method === 'OPTIONS') return next();

    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = requestCounts.get(key);
    if (!entry || now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
        requestCounts.set(key, { startedAt: now, count: 1 });
        return next();
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
        res.setHeader('Retry-After', String(Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.startedAt)) / 1000)));
        return res.status(429).json({ error: 'Too many requests', requestId });
    }
    next();
});
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: `${MAX_JSON_BODY}b` }));
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
    let image = '';
    let audio = '';
    let committed = false;
    try {
        const body = req.body ?? {};
        const measureCount = Number(body.measureCount);
        const initial = Number(body.initialTempo);
        const target = Number(body.targetTempo);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : '';
        const composer = typeof body.composer === 'string' ? body.composer.trim() : '';
        if (!title || !composer) return res.status(400).json({ error: 'Title and composer are required', requestId: req.requestId });
        if (title.length > MAX_TITLE_LENGTH || subtitle.length > MAX_SUBTITLE_LENGTH || composer.length > MAX_COMPOSER_LENGTH) return res.status(400).json({ error: 'Text fields exceed their length limits', requestId: req.requestId });
        if (!Number.isInteger(measureCount) || measureCount < 1 || measureCount > MAX_MEASURES || !Number.isFinite(initial) || !Number.isFinite(target) || initial < 1 || initial > MAX_TEMPO || target < 1 || target > MAX_TEMPO) return res.status(400).json({ error: 'Invalid measure or tempo values', requestId: req.requestId });
        if (body.imageFile !== undefined && !parseFile(body.imageFile)) return res.status(400).json({ error: 'Invalid image payload', requestId: req.requestId });
        if (body.audioFile !== undefined && !parseFile(body.audioFile)) return res.status(400).json({ error: 'Invalid audio payload', requestId: req.requestId });
        await ensureMediaDirs();
        image = await saveMedia(parseFile(body.imageFile), imagesDir, 'image');
        audio = await saveMedia(parseFile(body.audioFile), audioDir, 'audio');
        const id = randomUUID();
        const { error } = await supabase.rpc('create_song_with_measures', {
            p_id: id,
            p_title: title,
            p_subtitle: subtitle,
            p_composer: composer,
            p_image: image,
            p_audio: audio,
            p_measure_count: measureCount,
            p_initial: initial,
            p_target: target,
        });
        if (error) throw error;
        committed = true;
        const song = await getSongs(true, id);
        res.status(201).json({ song: publicSong(req, song, true) });
    } catch (error) {
        if (!committed) {
            await Promise.all([
                removeMedia(imagesDir, image),
                removeMedia(audioDir, audio),
            ]);
        }
        const clientError = error?.message?.startsWith('Invalid ') || error?.message?.includes('limit') || error?.message?.includes('Unsupported');
        console.error(error); res.status(clientError ? 400 : 500).json({ error: clientError ? error.message : 'Failed to create song', requestId: req.requestId });
    }
});

app.post('/songs/:id/update', async (req, res) => {
    const newMedia = { image: '', audio: '' };
    const oldMedia = { image: '', audio: '' };
    let committed = false;
    try {
        const existing = await getSongOr404(req.params.id, res);
        if (!existing) return;
        oldMedia.image = existing.image;
        oldMedia.audio = existing.audio;
        const body = req.body ?? {};
        const patch = {};
        for (const field of ['title', 'subtitle', 'composer', 'archived']) if (body[field] !== undefined) patch[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
        if (typeof patch.title === 'string' && (!patch.title || patch.title.length > MAX_TITLE_LENGTH)) return res.status(400).json({ error: 'Invalid title', requestId: req.requestId });
        if (typeof patch.subtitle === 'string' && patch.subtitle.length > MAX_SUBTITLE_LENGTH) return res.status(400).json({ error: 'Subtitle is too long', requestId: req.requestId });
        if (typeof patch.composer === 'string' && (!patch.composer || patch.composer.length > MAX_COMPOSER_LENGTH)) return res.status(400).json({ error: 'Invalid composer', requestId: req.requestId });
        if (body.imageFile !== undefined && !parseFile(body.imageFile)) return res.status(400).json({ error: 'Invalid image payload', requestId: req.requestId });
        if (body.audioFile !== undefined && !parseFile(body.audioFile)) return res.status(400).json({ error: 'Invalid audio payload', requestId: req.requestId });
        await ensureMediaDirs();
        if (parseFile(body.imageFile)) { newMedia.image = await saveMedia(parseFile(body.imageFile), imagesDir, 'image'); patch.image = newMedia.image; }
        if (parseFile(body.audioFile)) { newMedia.audio = await saveMedia(parseFile(body.audioFile), audioDir, 'audio'); patch.audio = newMedia.audio; }
        const { error } = await supabase.from('songs').update(patch).eq('id', req.params.id);
        if (error) throw error;
        committed = true;
        const cleanupResults = await Promise.allSettled([
            newMedia.image ? removeMedia(imagesDir, oldMedia.image) : Promise.resolve(),
            newMedia.audio ? removeMedia(audioDir, oldMedia.audio) : Promise.resolve(),
        ]);
        for (const result of cleanupResults) {
            if (result.status === 'rejected') console.error('Failed to remove replaced media', result.reason);
        }
        const song = await getSongs(true, req.params.id);
        res.json({ song: publicSong(req, song, true) });
    } catch (error) {
        if (!committed) {
            await Promise.all([
                removeMedia(imagesDir, newMedia.image),
                removeMedia(audioDir, newMedia.audio),
            ]);
        }
        console.error(error); res.status(error?.message?.includes('limit') || error?.message?.includes('Unsupported') ? 400 : 500).json({ error: error?.message?.includes('limit') || error?.message?.includes('Unsupported') ? error.message : 'Failed to update song', requestId: req.requestId });
    }
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
        const requestedNumbers = body.measureNumbers === undefined ? [req.params.measureNumber] : body.measureNumbers;
        if (!Array.isArray(requestedNumbers)) return res.status(400).json({ error: 'measureNumbers must be an array', requestId: req.requestId });
        const numbers = Array.from(new Set(requestedNumbers.map(Number).filter((number) => Number.isInteger(number) && number > 0)));
        if (!numbers.length || numbers.length > MAX_EVENT_BATCH || !['success', 'failure'].includes(body.outcome)) return res.status(400).json({ error: 'Invalid event batch', requestId: req.requestId });
        if (body.type && !['metronome', 'practice'].includes(body.type)) return res.status(400).json({ error: 'Invalid event type', requestId: req.requestId });
        if (body.type === 'metronome' && (!Number.isFinite(Number(body.bpm)) || Number(body.bpm) < 1 || Number(body.bpm) > MAX_TEMPO)) return res.status(400).json({ error: 'Invalid BPM', requestId: req.requestId });
        if (typeof req.get('X-Idempotency-Key') !== 'string' || !req.get('X-Idempotency-Key').trim() || req.get('X-Idempotency-Key').trim().length > 200) return res.status(400).json({ error: 'Idempotency key is required and must be 200 characters or fewer', requestId: req.requestId });
        const idempotencyKey = req.get('X-Idempotency-Key').trim();
        const timestamp = Math.floor(Date.now() / 1000);
        const elapsedSeconds = Math.ceil(Number(body.elapsedSeconds));
        if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 24 * 60 * 60) return res.status(400).json({ error: 'Invalid elapsed time', requestId: req.requestId });
        const { data: inserted, error } = await supabase.rpc('record_practice_events', {
            p_song_id: req.params.id,
            p_measure_numbers: numbers,
            p_timestamp: timestamp,
            p_type: body.type ?? 'metronome',
            p_value: body.type === 'metronome' ? Number(body.bpm) : null,
            p_outcome: body.outcome,
            p_elapsed_seconds: elapsedSeconds,
            p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
        const song = await getSongs(true, req.params.id);
        res.json({ measureNumbers: numbers, inserted: inserted !== false, song: publicSong(req, song, true) });
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
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Uploaded payload is too large', requestId: req.requestId });
    next(error);
});

await ensureMediaDirs();
app.listen(port, '0.0.0.0', () => console.log(`PracticeApp backend listening on port ${port}`));
