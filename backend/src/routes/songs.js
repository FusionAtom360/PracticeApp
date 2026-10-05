import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config, supabase } from '../config.js';
import { ensureMediaDirs, parseFile, saveMedia, removeMedia } from '../media/media-store.js';
import { createSongWithMeasures, getSongs, getSongOrNull } from '../repositories/song-repository.js';
import { publicSong } from '../serializers/song.js';

function clientError(error) {
    return error?.message?.startsWith('Invalid ')
        || error?.message?.includes('limit')
        || error?.message?.includes('Unsupported');
}

function songNotFound(res) {
    return res.status(404).json({ error: 'Song not found' });
}

export function createSongRouter() {
    const router = Router();

    router.get('/', async (req, res) => {
        try { res.json({ songs: (await getSongs()).map((song) => publicSong(req, song)) }); }
        catch (error) { console.error(error); res.status(500).json({ error: 'Failed to retrieve songs', requestId: req.requestId }); }
    });

    router.get('/:id', async (req, res) => {
        try {
            const song = await getSongOrNull(req.params.id);
            if (!song) return songNotFound(res);
            res.json({ song: publicSong(req, song, true) });
        } catch (error) {
            console.error(error); res.status(500).json({ error: 'Failed to retrieve song', requestId: req.requestId });
        }
    });

    router.post('/create', async (req, res) => {
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
            if (title.length > config.maxTitleLength || subtitle.length > config.maxSubtitleLength || composer.length > config.maxComposerLength) return res.status(400).json({ error: 'Text fields exceed their length limits', requestId: req.requestId });
            if (!Number.isInteger(measureCount) || measureCount < 1 || measureCount > config.maxMeasures || !Number.isFinite(initial) || !Number.isFinite(target) || initial < 1 || initial > config.maxTempo || target < 1 || target > config.maxTempo) return res.status(400).json({ error: 'Invalid measure or tempo values', requestId: req.requestId });
            if (body.imageFile !== undefined && !parseFile(body.imageFile)) return res.status(400).json({ error: 'Invalid image payload', requestId: req.requestId });
            if (body.audioFile !== undefined && !parseFile(body.audioFile)) return res.status(400).json({ error: 'Invalid audio payload', requestId: req.requestId });
            await ensureMediaDirs();
            image = await saveMedia(parseFile(body.imageFile), config.imagesDir, 'image');
            audio = await saveMedia(parseFile(body.audioFile), config.audioDir, 'audio');
            const id = randomUUID();
            const { error } = await createSongWithMeasures({ p_id: id, p_title: title, p_subtitle: subtitle, p_composer: composer, p_image: image, p_audio: audio, p_measure_count: measureCount, p_initial: initial, p_target: target });
            if (error) throw error;
            committed = true;
            res.status(201).json({ song: publicSong(req, await getSongs(true, id), true) });
        } catch (error) {
            if (!committed) await Promise.all([removeMedia(config.imagesDir, image), removeMedia(config.audioDir, audio)]);
            const badRequest = clientError(error);
            console.error(error); res.status(badRequest ? 400 : 500).json({ error: badRequest ? error.message : 'Failed to create song', requestId: req.requestId });
        }
    });

    router.post('/:id/update', async (req, res) => {
        const newMedia = { image: '', audio: '' };
        let committed = false;
        try {
            const existing = await getSongOrNull(req.params.id);
            if (!existing) return songNotFound(res);
            const body = req.body ?? {};
            const patch = {};
            for (const field of ['title', 'subtitle', 'composer', 'archived']) if (body[field] !== undefined) patch[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
            if (typeof patch.title === 'string' && (!patch.title || patch.title.length > config.maxTitleLength)) return res.status(400).json({ error: 'Invalid title', requestId: req.requestId });
            if (typeof patch.subtitle === 'string' && patch.subtitle.length > config.maxSubtitleLength) return res.status(400).json({ error: 'Subtitle is too long', requestId: req.requestId });
            if (typeof patch.composer === 'string' && (!patch.composer || patch.composer.length > config.maxComposerLength)) return res.status(400).json({ error: 'Invalid composer', requestId: req.requestId });
            if (body.imageFile !== undefined && !parseFile(body.imageFile)) return res.status(400).json({ error: 'Invalid image payload', requestId: req.requestId });
            if (body.audioFile !== undefined && !parseFile(body.audioFile)) return res.status(400).json({ error: 'Invalid audio payload', requestId: req.requestId });
            await ensureMediaDirs();
            if (parseFile(body.imageFile)) { newMedia.image = await saveMedia(parseFile(body.imageFile), config.imagesDir, 'image'); patch.image = newMedia.image; }
            if (parseFile(body.audioFile)) { newMedia.audio = await saveMedia(parseFile(body.audioFile), config.audioDir, 'audio'); patch.audio = newMedia.audio; }
            const { error } = await supabase.from('songs').update(patch).eq('id', req.params.id);
            if (error) throw error;
            committed = true;
            const cleanup = await Promise.allSettled([
                newMedia.image ? removeMedia(config.imagesDir, existing.image) : Promise.resolve(),
                newMedia.audio ? removeMedia(config.audioDir, existing.audio) : Promise.resolve(),
            ]);
            cleanup.filter((result) => result.status === 'rejected').forEach((result) => console.error('Failed to remove replaced media', result.reason));
            res.json({ song: publicSong(req, await getSongs(true, req.params.id), true) });
        } catch (error) {
            if (!committed) await Promise.all([removeMedia(config.imagesDir, newMedia.image), removeMedia(config.audioDir, newMedia.audio)]);
            const badRequest = clientError(error);
            console.error(error); res.status(badRequest ? 400 : 500).json({ error: badRequest ? error.message : 'Failed to update song', requestId: req.requestId });
        }
    });

    router.patch('/:id/measures/:measureNumber', async (req, res) => {
        try {
            const { data: measure, error } = await supabase.from('measures').select('id').eq('song_id', req.params.id).eq('number', Number(req.params.measureNumber)).single();
            if (error || !measure) return res.status(404).json({ error: 'Measure not found', requestId: req.requestId });
            const patch = {};
            for (const field of ['initial', 'target', 'ignore_tempo', 'mode']) if (req.body[field] !== undefined) patch[field] = req.body[field];
            const { error: updateError } = await supabase.from('measures').update(patch).eq('id', measure.id);
            if (updateError) throw updateError;
            res.json({ song: publicSong(req, await getSongs(true, req.params.id), true) });
        } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to update measure', requestId: req.requestId }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const song = await getSongOrNull(req.params.id);
            if (!song) return songNotFound(res);
            const { error } = await supabase.from('songs').delete().eq('id', req.params.id);
            if (error) throw error;
            await Promise.all([removeMedia(config.imagesDir, song.image), removeMedia(config.audioDir, song.audio)]);
            res.json({ songs: (await getSongs()).map((entry) => publicSong(req, entry)) });
        } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to delete song', requestId: req.requestId }); }
    });

    return router;
}

export async function clearProgress(req, res, measureNumber = null) {
    const song = await getSongOrNull(req.params.id);
    if (!song) return songNotFound(res);
    const measures = measureNumber === null ? song.measures : song.measures.filter((measure) => measure.number === measureNumber);
    if (!measures.length) return res.status(404).json({ error: 'Measure not found', requestId: req.requestId });
    for (const measure of measures) {
        const { data: row, error } = await supabase.from('measures').select('id').eq('song_id', req.params.id).eq('number', measure.number).single();
        if (error) throw error;
        const { error: eventError } = await supabase.from('practice_events').delete().eq('measure_id', row.id);
        if (eventError) throw eventError;
        const { error: measureError } = await supabase.from('measures').update({ elapsed_time: 0, last_event_at: null, last_metronome_bpm: null, success_count: 0, event_count: 0 }).eq('id', row.id);
        if (measureError) throw measureError;
    }
    if (measureNumber === null) {
        const { error } = await supabase.from('songs').update({ elapsed_time: 0 }).eq('id', req.params.id);
        if (error) throw error;
    }
    res.json({ song: publicSong(req, await getSongs(true, req.params.id), true) });
}
