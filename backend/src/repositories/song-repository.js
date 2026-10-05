import { supabase } from '../config.js';

const measureColumns = 'id,number,initial,target,ignore_tempo,mode,elapsed_time,last_event_at,last_metronome_bpm,success_count,event_count';
const detailMeasureColumns = `${measureColumns},practice_events(timestamp,type,value,outcome)`;

export async function getSongs(ownerId, detail = false, id = null) {
    let query = supabase.from('songs')
        .select(`id,archived,title,subtitle,composer,image,audio,measure_count,elapsed_time,measures(${detail ? detailMeasureColumns : measureColumns})`)
        .order('created_at');
    query = query.eq('owner_id', ownerId);
    if (id) query = query.eq('id', id).single();
    const { data, error } = await query;
    if (error) {
        if (id && error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

export async function getSongOrNull(ownerId, id) {
    return getSongs(ownerId, true, id);
}

export async function createSongWithMeasures(input) {
    return supabase.rpc('create_song_with_measures', input);
}

export async function recordPracticeEvents(input) {
    return supabase.rpc('record_practice_events', input);
}

export { supabase };
