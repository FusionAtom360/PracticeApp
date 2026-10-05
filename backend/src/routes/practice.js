import { Router } from 'express';
import { config, supabase } from '../config.js';
import { getSongs, recordPracticeEvents } from '../repositories/song-repository.js';
import { publicSong } from '../serializers/song.js';

export function createPracticeRouter() {
    const router = Router();
    router.post('/:id/measures/:measureNumber/events', async (req, res) => {
        try {
            const body = req.body ?? {};
            const requestedNumbers = body.measureNumbers === undefined ? [req.params.measureNumber] : body.measureNumbers;
            if (!Array.isArray(requestedNumbers)) return res.status(400).json({ error: 'measureNumbers must be an array', requestId: req.requestId });
            const numbers = Array.from(new Set(requestedNumbers.map(Number).filter((number) => Number.isInteger(number) && number > 0)));
            if (!numbers.length || numbers.length > config.maxEventBatch || !['success', 'failure'].includes(body.outcome)) return res.status(400).json({ error: 'Invalid event batch', requestId: req.requestId });
            if (body.type && !['metronome', 'practice'].includes(body.type)) return res.status(400).json({ error: 'Invalid event type', requestId: req.requestId });
            if (body.type === 'metronome' && (!Number.isFinite(Number(body.bpm)) || Number(body.bpm) < 1 || Number(body.bpm) > config.maxTempo)) return res.status(400).json({ error: 'Invalid BPM', requestId: req.requestId });
            const idempotencyKey = req.get('X-Idempotency-Key')?.trim();
            if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: 'Idempotency key is required and must be 200 characters or fewer', requestId: req.requestId });
            const elapsedSeconds = Math.ceil(Number(body.elapsedSeconds));
            if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 24 * 60 * 60) return res.status(400).json({ error: 'Invalid elapsed time', requestId: req.requestId });
            const { data: inserted, error } = await recordPracticeEvents({
                p_song_id: req.params.id,
                p_measure_numbers: numbers,
                p_timestamp: Math.floor(Date.now() / 1000),
                p_type: body.type ?? 'metronome',
                p_value: body.type === 'metronome' ? Number(body.bpm) : null,
                p_outcome: body.outcome,
                p_elapsed_seconds: elapsedSeconds,
                p_idempotency_key: idempotencyKey,
            });
            if (error) throw error;
            res.json({ measureNumbers: numbers, inserted: inserted !== false, song: publicSong(req, await getSongs(true, req.params.id), true) });
        } catch (error) {
            console.error('Failed to add practice event', {
                requestId: req.requestId,
                code: error?.code,
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
            });
            res.status(500).json({
                error: 'Failed to add event',
                requestId: req.requestId,
                code: error?.code === 'PGRST202' ? 'PRACTICE_EVENT_RPC_UNAVAILABLE' : 'PRACTICE_EVENT_WRITE_FAILED',
            });
        }
    });
    return router;
}

export async function deleteMeasure(req, res) {
    try {
        const { error } = await supabase.from('measures').delete().eq('song_id', req.params.id).eq('number', Number(req.params.measureNumber));
        if (error) throw error;
        const { data: measures, error: listError } = await supabase.from('measures').select('number').eq('song_id', req.params.id).order('number');
        if (listError) throw listError;
        const { error: songError } = await supabase.from('songs').update({ measure_count: measures.length }).eq('id', req.params.id);
        if (songError) throw songError;
        res.json({ song: publicSong(req, await getSongs(true, req.params.id), true) });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Failed to delete measure', requestId: req.requestId }); }
}
