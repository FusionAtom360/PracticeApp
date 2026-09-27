import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const file = new URL('../data/songs.json', import.meta.url);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { songs = [] } = JSON.parse(await readFile(file, 'utf8'));

function throwMigrationError(error) {
    if (error?.code === 'PGRST205') {
        throw new Error('Supabase tables are missing. Run backend/supabase/schema.sql in the Supabase SQL Editor for the configured project, then rerun npm run migrate:json.');
    }

    throw error;
}

for (const song of songs) {
    const { error: songError } = await supabase.from('songs').upsert({
        id: song.id,
        archived: Boolean(song.archived),
        title: song.title,
        subtitle: song.subtitle ?? '',
        composer: song.composer,
        image: song.image ?? '',
        audio: song.audio ?? '',
        measure_count: song.measureCount ?? song.measures?.length ?? 0,
        elapsed_time: song.elapsedTime ?? song.timeElapsed ?? 0,
    });
    if (songError) throwMigrationError(songError);

    for (const measure of song.measures ?? []) {
        const { data, error: measureError } = await supabase.from('measures').upsert({
            song_id: song.id,
            number: measure.number,
            initial: measure.initial ?? measure.current ?? 0,
            target: measure.target ?? 0,
            ignore_tempo: Boolean(measure.ignoreTempo),
            mode: measure.mode ?? 'stability',
            elapsed_time: measure.elapsedTime ?? measure.timeElapsed ?? 0,
        }, { onConflict: 'song_id,number' }).select('id').single();
        if (measureError) throwMigrationError(measureError);

        const events = (measure.events ?? []).map((event) => ({
            measure_id: data.id,
            timestamp: Number(event.timestamp),
            type: event.type ?? 'practice',
            value: typeof event.value === 'number' ? event.value : null,
            outcome: event.outcome,
        }));
        if (events.length) {
            const { error: eventError } = await supabase.from('practice_events').insert(events);
            if (eventError) throwMigrationError(eventError);
        }
    }
    console.log(`Migrated ${song.title}`);
}
