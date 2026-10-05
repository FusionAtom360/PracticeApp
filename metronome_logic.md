# Metronome and Practice Metrics

This document defines the canonical practice-metric rules used by PracticeApp. The server and client must preserve these rules when adding views or changing the storage model.

## Domain model

A song contains ordered measures. A measure has:

- `target`: target quarter-note BPM.
- `ignoreTempo`: when true, tempo attainment is treated as complete.
- practice events with a timestamp, type, outcome, and optional BPM value.
- denormalized server fields used by list responses:
  - `last_event_at`
  - `last_metronome_bpm`
  - `success_count`
  - `event_count`

Supported event types are `metronome` and `practice`. Every event has an outcome of `success` or `failure`. A metronome event has a positive BPM; a practice event has no BPM value.

## Canonical constants

| Constant | Value | Meaning |
|---|---:|---|
| Progress window | 50 events | Only the most recent 50 outcomes affect accuracy/progress. Missing attempts count as failures. |
| Decay rate | 0.98 | Progress retains 98% of its value for each full day since the latest event. |
| Historical comparison | 24 hours | “Before” values use events strictly earlier than `now - 86,400 seconds`. |

## Measure progress

For a measure with at least one event and a positive target:

```text
tempoAttainment = currentTempo / target
successRatio = successesInLatest50Events / 50
decay = 0.98 ^ fullDaysSinceLatestEvent

progress = clamp(tempoAttainment * successRatio * decay, 0, 1)
```

`clamp(value, 0, 1)` prevents progress from exceeding 100% or becoming negative.

### Current tempo

- If `ignoreTempo` is true, `currentTempo = target`.
- Otherwise, `currentTempo` is the BPM of the latest metronome event by timestamp.
- If there is no usable metronome BPM, current tempo is zero and progress is zero.

The latest event is determined by numeric timestamp, not by array position. When timestamps tie, the database event ID is the stable tie-breaker for server-maintained summaries.

### Success ratio

Sort events chronologically, take the last 50, and count outcomes equal to `success`. The denominator is always 50, so a measure with five successes and no other attempts has an accuracy of 10%, not 100%. This intentionally rewards sustained consistency rather than a small number of attempts.

### Decay

```text
fullDaysSinceLatestEvent =
  floor((referenceTimeSeconds - latestEventTimestamp) / 86,400)
```

Negative elapsed time is treated as zero. The server uses its current time; the client uses the browser's current time when it has detailed events. List responses use the server's canonical `progress` field, avoiding a client/server disagreement when event details are not loaded.

## Historical progress

The historical value shown in the progress bar is the measure's progress immediately before the most recent 24-hour period:

1. Compute `cutoff = now - 86,400`.
2. Keep events with `timestamp < cutoff`.
3. If none remain, historical progress is zero.
4. Apply the same progress formula using the retained events and `referenceTimeSeconds = cutoff`.

This makes the comparison meaningful: current progress is evaluated now, while historical progress is evaluated at the boundary before the latest day.

## Accuracy

Measure accuracy is:

```text
successesInLatest50Events / 50 * 100
```

For list responses, the server returns this as `accuracy`. For detailed responses, the client derives the same value from sorted events. Song accuracy is the arithmetic mean of measure accuracies, including measures with no successes as zero.

## Average tempo

For each measure:

- ignored-tempo measures contribute their target;
- otherwise, the latest usable metronome BPM contributes;
- measures without a usable tempo do not contribute.

Song average tempo is the rounded arithmetic mean of contributing measures. In list responses the server's `averageTempo` field is the latest metronome BPM (or the target for an ignored-tempo measure when derived client-side); detailed event views derive the same latest-value rule from events.

## Last practice

The song's last practice timestamp is the maximum valid event timestamp across all measures. Event array order is never trusted.

## Empty and malformed data

- No measures: song metrics are zero and last practice is `null`.
- No events: progress, accuracy, and tempo are zero.
- Non-finite timestamps or BPM values are ignored by client calculations and rejected at the API boundary.
- A non-positive target produces zero progress.
- Progress is always clamped to `[0, 1]`.

## Implementation locations

- Server canonical summary calculation: `backend/server.js`, `calculateCanonicalProgress`.
- Database-maintained latest event/counter fields: `backend/supabase/schema.sql`, `record_practice_events`.
- Client detailed-event calculations: `frontend/src/lib/songs.ts`.
- Song and measure presentation: `frontend/src/components/layout/SongHeader/SongHeader.tsx` and `frontend/src/components/ui/MeasuresOverview/MeasuresOverview.tsx`.

The server is authoritative for summary/list responses. The client is allowed to calculate only when detailed events are present or when presenting historical comparisons that require event history. Any future change to constants or formulas must update this document and both implementations together.

## Worked example

Assume:

- target: 120 BPM;
- latest usable metronome BPM: 96;
- latest 50 outcomes contain 40 successes;
- latest event was 2 full days ago;
- tempo is not ignored.

```text
tempoAttainment = 96 / 120 = 0.80
successRatio = 40 / 50 = 0.80
decay = 0.98 ^ 2 = 0.9604
progress = 0.80 * 0.80 * 0.9604 = 0.614656
displayed progress = 61.5%
accuracy = 80%
```

