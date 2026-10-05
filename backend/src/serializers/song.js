import { calculateCanonicalProgress } from '../domain/progress.js';
import { config } from '../config.js';

export function publicSong(req, song, detail = false) {
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
                ...(detail ? {
                    events: (measure.practice_events ?? []).map((event) => ({
                        timestamp: Number(event.timestamp),
                        type: event.type,
                        ...(event.value === null ? {} : { value: Number(event.value) }),
                        outcome: event.outcome,
                    })),
                } : {
                    progress: calculateCanonicalProgress(measure),
                    averageTempo: measure.last_metronome_bpm,
                    accuracy: measure.event_count ? (Number(measure.success_count) / config.progressWindowSize) * 100 : 0,
                    lastPractice: measure.last_event_at,
                }),
            })),
        imageUrl: song.image ? `${baseUrl}/images/${song.image}` : null,
        audioUrl: song.audio ? `${baseUrl}/audio/${song.audio}` : null,
    };
}
