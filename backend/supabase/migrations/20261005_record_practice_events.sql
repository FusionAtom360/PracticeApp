-- Apply this migration before deploying the backend that sends p_idempotency_key.
-- The function is repeated here because schema.sql is not a migration runner.

alter table public.practice_events
    add column if not exists idempotency_key text;

create unique index if not exists practice_events_measure_idempotency_key_idx
    on public.practice_events (measure_id, idempotency_key)
    where idempotency_key is not null;

create or replace function public.record_practice_events(
    p_song_id uuid,
    p_measure_numbers integer[],
    p_timestamp bigint,
    p_type text,
    p_value numeric,
    p_outcome text,
    p_elapsed_seconds integer,
    p_idempotency_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    measure_ids uuid[];
    inserted_count integer;
begin
    if p_measure_numbers is null
        or cardinality(p_measure_numbers) = 0
        or cardinality(p_measure_numbers) > 100
        or p_type is null
        or p_type not in ('metronome', 'practice')
        or p_outcome not in ('success', 'failure')
        or p_elapsed_seconds < 0
        or p_elapsed_seconds > 86400
        or (p_type = 'metronome' and (p_value is null or p_value < 1 or p_value > 400))
        or p_idempotency_key is null
        or length(trim(p_idempotency_key)) = 0
        or length(p_idempotency_key) > 200 then
        raise exception 'Invalid practice event';
    end if;

    select array_agg(m.id order by m.number)
    into measure_ids
    from public.measures m
    where m.song_id = p_song_id
      and m.number = any(p_measure_numbers);

    if measure_ids is null or cardinality(measure_ids) <> cardinality(p_measure_numbers) then
        raise exception 'One or more measures were not found';
    end if;

    if exists (
        select 1
        from public.practice_events e
        where e.measure_id = any(measure_ids)
          and e.idempotency_key = p_idempotency_key
    ) then
        return false;
    end if;

    insert into public.practice_events (measure_id, timestamp, type, value, outcome, idempotency_key)
    select unnest(measure_ids), p_timestamp, p_type, p_value, p_outcome, p_idempotency_key;
    get diagnostics inserted_count = row_count;

    update public.measures m
    set elapsed_time = m.elapsed_time + p_elapsed_seconds,
        last_event_at = stats.last_event_at,
        last_metronome_bpm = stats.last_metronome_bpm,
        success_count = stats.success_count,
        event_count = stats.event_count
    from (
        select m2.id,
               (select max(e.timestamp) from public.practice_events e where e.measure_id = m2.id) as last_event_at,
               (select e.value from public.practice_events e where e.measure_id = m2.id and e.type = 'metronome' order by e.timestamp desc, e.id desc limit 1) as last_metronome_bpm,
               (select count(*) from (
                   select e.outcome
                   from public.practice_events e
                   where e.measure_id = m2.id
                   order by e.timestamp desc, e.id desc
                   limit 50
               ) recent where recent.outcome = 'success')::integer as success_count,
               (select count(*) from public.practice_events e where e.measure_id = m2.id)::integer as event_count
        from public.measures m2
        where m2.id = any(measure_ids)
    ) stats
    where m.id = stats.id;

    update public.songs
    set elapsed_time = elapsed_time + p_elapsed_seconds
    where id = p_song_id;

    return inserted_count = cardinality(measure_ids);
end;
$$;

revoke execute on function public.record_practice_events(uuid, integer[], bigint, text, numeric, text, integer, text) from public;
grant execute on function public.record_practice_events(uuid, integer[], bigint, text, numeric, text, integer, text) to service_role;
