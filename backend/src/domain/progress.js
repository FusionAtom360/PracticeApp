import { config } from '../config.js';

export function calculateCanonicalProgress(measure, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (Number(measure.target) <= 0 || Number(measure.event_count) === 0) return 0;
    const tempo = measure.ignore_tempo ? Number(measure.target) : Number(measure.last_metronome_bpm || 0);
    const daysSincePractice = measure.last_event_at
        ? Math.max(0, Math.floor((nowSeconds - Number(measure.last_event_at)) / config.daySeconds))
        : 0;
    const progress = (tempo / Number(measure.target))
        * (Number(measure.success_count) / config.progressWindowSize)
        * Math.pow(config.decayRatePerDay, daysSincePractice);
    return Math.max(0, Math.min(1, progress));
}
