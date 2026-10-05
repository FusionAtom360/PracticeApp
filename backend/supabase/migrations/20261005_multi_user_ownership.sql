-- Before enforcing NOT NULL, assign existing songs to a real Supabase user.
-- Example: update public.songs set owner_id = '<user uuid>' where owner_id is null;

alter table public.songs
    add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists songs_owner_id_created_at_idx
    on public.songs (owner_id, created_at);

alter table public.songs
    alter column owner_id set not null;

alter table public.songs enable row level security;
alter table public.measures enable row level security;
alter table public.practice_events enable row level security;

drop policy if exists songs_owner_policy on public.songs;
create policy songs_owner_policy on public.songs
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists measures_owner_policy on public.measures;
create policy measures_owner_policy on public.measures
    for all using (exists (select 1 from public.songs s where s.id = song_id and s.owner_id = auth.uid()))
    with check (exists (select 1 from public.songs s where s.id = song_id and s.owner_id = auth.uid()));

drop policy if exists practice_events_owner_policy on public.practice_events;
create policy practice_events_owner_policy on public.practice_events
    for all using (exists (
        select 1 from public.measures m
        join public.songs s on s.id = m.song_id
        where m.id = measure_id and s.owner_id = auth.uid()
    )) with check (exists (
        select 1 from public.measures m
        join public.songs s on s.id = m.song_id
        where m.id = measure_id and s.owner_id = auth.uid()
    ));

drop function if exists public.create_song_with_measures(uuid, text, text, text, text, text, integer, numeric, numeric);
drop function if exists public.record_practice_events(uuid, integer[], bigint, text, numeric, text, integer, text);

-- Recreate the owner-scoped RPCs from schema.sql after removing their old signatures.
create or replace function public.create_song_with_measures(
    p_id uuid, p_owner_id uuid, p_title text, p_subtitle text, p_composer text,
    p_image text, p_audio text, p_measure_count integer, p_initial numeric, p_target numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
    if p_measure_count < 1 or p_measure_count > 1000
        or p_initial < 1 or p_initial > 400 or p_target < 1 or p_target > 400 then
        raise exception 'Invalid song limits';
    end if;
    insert into public.songs (id, owner_id, title, subtitle, composer, image, audio, measure_count)
    values (p_id, p_owner_id, p_title, p_subtitle, p_composer, p_image, p_audio, p_measure_count);
    insert into public.measures (song_id, number, initial, target)
    select p_id, series.number, p_initial, p_target
    from generate_series(1, p_measure_count) as series(number);
    return p_id;
end;
$$;

create or replace function public.record_practice_events(
    p_song_id uuid, p_owner_id uuid, p_measure_numbers integer[], p_timestamp bigint,
    p_type text, p_value numeric, p_outcome text, p_elapsed_seconds integer, p_idempotency_key text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
    measure_ids uuid[];
    inserted_count integer;
begin
    if p_measure_numbers is null or cardinality(p_measure_numbers) = 0 or cardinality(p_measure_numbers) > 100
        or p_type is null or p_type not in ('metronome', 'practice')
        or p_outcome not in ('success', 'failure') or p_elapsed_seconds < 0 or p_elapsed_seconds > 86400
        or (p_type = 'metronome' and (p_value is null or p_value < 1 or p_value > 400))
        or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 or length(p_idempotency_key) > 200 then
        raise exception 'Invalid practice event';
    end if;
    select array_agg(m.id order by m.number) into measure_ids
    from public.measures m
    where m.song_id = p_song_id and m.number = any(p_measure_numbers)
      and exists (select 1 from public.songs s where s.id = m.song_id and s.owner_id = p_owner_id);
    if measure_ids is null or cardinality(measure_ids) <> cardinality(p_measure_numbers) then
        raise exception 'One or more measures were not found';
    end if;
    if exists (select 1 from public.practice_events e where e.measure_id = any(measure_ids) and e.idempotency_key = p_idempotency_key) then
        return false;
    end if;
    insert into public.practice_events (measure_id, timestamp, type, value, outcome, idempotency_key)
    select unnest(measure_ids), p_timestamp, p_type, p_value, p_outcome, p_idempotency_key;
    get diagnostics inserted_count = row_count;
    update public.measures m
    set elapsed_time = m.elapsed_time + p_elapsed_seconds,
        last_event_at = (select max(e.timestamp) from public.practice_events e where e.measure_id = m.id),
        last_metronome_bpm = (select e.value from public.practice_events e where e.measure_id = m.id and e.type = 'metronome' order by e.timestamp desc, e.id desc limit 1),
        success_count = (select count(*) from (select e.outcome from public.practice_events e where e.measure_id = m.id order by e.timestamp desc, e.id desc limit 50) recent where recent.outcome = 'success'),
        event_count = (select count(*) from public.practice_events e where e.measure_id = m.id)
    where m.id = any(measure_ids);
    update public.songs set elapsed_time = elapsed_time + p_elapsed_seconds where id = p_song_id and owner_id = p_owner_id;
    return inserted_count = cardinality(measure_ids);
end;
$$;

revoke execute on function public.create_song_with_measures(uuid, uuid, text, text, text, text, text, integer, numeric, numeric) from public;
revoke execute on function public.record_practice_events(uuid, uuid, integer[], bigint, text, numeric, text, integer, text) from public;
grant execute on function public.create_song_with_measures(uuid, uuid, text, text, text, text, text, integer, numeric, numeric) to service_role;
grant execute on function public.record_practice_events(uuid, uuid, integer[], bigint, text, numeric, text, integer, text) to service_role;
