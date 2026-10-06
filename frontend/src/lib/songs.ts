export interface Measure {
    current: number;
    target: number;
    elapsedTime?: number;
    recent?: boolean[];
    number?: number;
    events?: Array<{
        timestamp?: number | string;
        type?: string;
        value?: number | string | null;
        outcome?: 'success' | 'failure';
    }>;
    ignoreTempo?: boolean;
    mode?: 'rapid' | 'speed' | 'stability';
    progress?: number;
    averageTempo?: number;
    accuracy?: number;
    lastPractice?: number;
}

export interface Song {
    id: string;
    title: string;
    subtitle?: string;
    composer: string;
    archived?: boolean;
    elapsedTime?: number;
    imageUrl?: string | null;
    image?: string;
    audio?: string;
    audioUrl?: string | null;
    measures?: Measure[];
    measureCount?: number;
}

interface EncodedFile {
    name: string;
    data: string;
    type: string;
}

function getApiBaseUrl(): string {
    const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

    if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim()) {
        return configuredBaseUrl.replace(/\/$/, '');
    }

    if (import.meta.env.DEV) {
        return 'http://localhost:3000';
    }

    return 'https://practice.josephyakligian.com';
}

export function createApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${getApiBaseUrl()}${normalizedPath}`;
}

const PROGRESS_WINDOW_SIZE = 50;
const DECAY_RATE_PER_DAY = 0.98;
const HISTORY_CUTOFF_SECONDS = 24 * 60 * 60;

function sortEventsByTimestamp(events: NonNullable<Measure['events']>) {
    return [...events].sort((first, second) => Number(first.timestamp ?? 0) - Number(second.timestamp ?? 0));
}

function getLatestMetronomeTempo(events: NonNullable<Measure['events']>): number {
    const latest = sortEventsByTimestamp(events)
        .filter((event) => event.type === 'metronome' && Number.isFinite(Number(event.value)) && Number(event.value) > 0)
        .at(-1);
    return latest ? Number(latest.value) : 0;
}

function calculateProgressFromEvents(
    measure: Measure,
    events: NonNullable<Measure['events']>,
    referenceTimeSeconds: number,
): number {
    if (measure.target <= 0 || events.length === 0) return 0;

    const orderedEvents = sortEventsByTimestamp(events);
    const currentTempo = measure.ignoreTempo ? measure.target : getLatestMetronomeTempo(orderedEvents);
    const recentEvents = orderedEvents.slice(-PROGRESS_WINDOW_SIZE);
    const successCount = recentEvents.filter((event) => event.outcome === 'success').length;
    const lastEventTimestamp = Number(orderedEvents.at(-1)?.timestamp);
    const daysSinceLastPractice = Number.isFinite(lastEventTimestamp)
        ? Math.max(0, Math.floor((referenceTimeSeconds - lastEventTimestamp) / HISTORY_CUTOFF_SECONDS))
        : 0;
    const progress = (currentTempo / measure.target)
        * (successCount / PROGRESS_WINDOW_SIZE)
        * Math.pow(DECAY_RATE_PER_DAY, daysSinceLastPractice);

    return Math.max(0, Math.min(1, progress));
}

export function calculateMeasureProgress(measure: Measure): number {
    const events = Array.isArray(measure.events) ? measure.events : [];
    if (events.length === 0 && typeof measure.progress === 'number') return measure.progress;
    return calculateProgressFromEvents(measure, events, Math.floor(Date.now() / 1000));
}

export function calculateMeasureProgressBefore24h(measure: Measure): number {
    if (!measure || measure.target <= 0) return 0;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const cutoff = nowSeconds - HISTORY_CUTOFF_SECONDS;

    // Get all events from before 24 hours ago
    const events = Array.isArray(measure.events) ? measure.events : [];
    const eventsBefore24h = events.filter((event) => Number(event.timestamp) < cutoff);
    
    // If no events exist before 24 hours ago, return 0 (no progress data from before the period)
    if (eventsBefore24h.length === 0) return 0;

    return calculateProgressFromEvents(measure, eventsBefore24h, cutoff); // Clamp between 0 and 1
}

export function calculateSongProgress(song: Song): number {
    const measures = Array.isArray(song.measures) ? song.measures : [];
    if (measures.length === 0) return 0;
    const sum = measures.reduce((acc, measure) => acc + calculateMeasureProgress(measure), 0);
    return sum / measures.length;
}

export function calculateSongProgressBefore24h(song: Song): number {
    const measures = Array.isArray(song.measures) ? song.measures : [];
    if (measures.length === 0) return 0;
    const sum = measures.reduce((acc, measure) => acc + calculateMeasureProgressBefore24h(measure), 0);
    return sum / measures.length;
}

export function calculateSongAverageTempo(song: Song): number {
    const measures = Array.isArray(song.measures) ? song.measures : [];
    if (measures.length === 0) return 0;

    let totalTempo = 0;
    let measureCount = 0;

    for (const measure of measures) {
        if (!measure) continue;

        if (Array.isArray(measure.events) === false && typeof measure.averageTempo === 'number') {
            if (measure.averageTempo > 0) {
                totalTempo += measure.averageTempo;
                measureCount++;
            }
            continue;
        }

        let currentTempo = 0;
        if (measure.ignoreTempo) {
            currentTempo = measure.target || 0;
        } else {
            const events = Array.isArray(measure.events) ? measure.events : [];
            currentTempo = getLatestMetronomeTempo(events);
        }

        if (currentTempo > 0) {
            totalTempo += currentTempo;
            measureCount++;
        }
    }

    return measureCount > 0 ? Math.round(totalTempo / measureCount) : 0;
}

export function calculateSongAverageAccuracy(song: Song): number {
    const measures = Array.isArray(song.measures) ? song.measures : [];
    if (measures.length === 0) return 0;

    let totalSuccesses = 0;
    let totalAttempts = 0;

    for (const measure of measures) {
        if (!measure) continue;

        if (Array.isArray(measure.events) === false && typeof measure.accuracy === 'number') {
            totalSuccesses += measure.accuracy;
            totalAttempts += 100;
            continue;
        }

        const events = Array.isArray(measure.events) ? measure.events : [];
        const lastFiftyEvents = sortEventsByTimestamp(events).slice(-PROGRESS_WINDOW_SIZE);
        
        // Count successes in last 50 attempts
        const successCount = lastFiftyEvents.filter(e => e && e.outcome === 'success').length;
        
        // If fewer than 50 events, count missing as failures
        totalSuccesses += successCount;
        totalAttempts += 50;
    }

    return totalAttempts > 0 ? Math.round((totalSuccesses / totalAttempts) * 100) : 0;
}

export function calculateSongLastPracticeTime(song: Song): number | null {
    const measures = Array.isArray(song.measures) ? song.measures : [];
    
    let latestTimestamp: number | null = null;

    for (const measure of measures) {
        if (!measure) continue;

        if (Array.isArray(measure.events) === false && typeof measure.lastPractice === 'number') {
            latestTimestamp = latestTimestamp === null ? measure.lastPractice : Math.max(latestTimestamp, measure.lastPractice);
            continue;
        }

        const events = Array.isArray(measure.events) ? sortEventsByTimestamp(measure.events) : [];
        if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            if (lastEvent && typeof lastEvent.timestamp === 'number') {
                if (latestTimestamp === null || lastEvent.timestamp > latestTimestamp) {
                    latestTimestamp = lastEvent.timestamp;
                }
            }
        }
    }

    return latestTimestamp;
}

export function formatLastPracticeTime(timestamp: number | null | undefined): string {
    if (!timestamp) return 'Never';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
    } else if (diffHours > 0) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes === 0 ? 'Just now' : `${diffMinutes} minutes ago`;
    }
}

export function formatTimePracticed(seconds?: number): string {
    if (!seconds || seconds <= 0) return '0h 0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

export interface SongUpdateInput {
    title?: string;
    subtitle?: string;
    composer?: string;
    archived?: boolean;
    imageFile?: File | null;
    audioFile?: File | null;
}

export interface MeasureUpdateInput {
    initial?: number;
    target?: number;
    ignore_tempo?: boolean;
    mode?: 'rapid' | 'speed' | 'stability';
}

export interface CreateSongInput {
    title: string;
    subtitle?: string;
    composer: string;
    measureCount: number;
    initialTempo: number;
    targetTempo: number;
    imageFile?: File | null;
    audioFile?: File | null;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_MEASURES = 1000;
export const MAX_TEMPO = 400;

export class MutationQueuedError extends Error {
    readonly queued = true;

    constructor(message = "Changes were queued and will sync when the connection is restored.") {
        super(message);
        this.name = "MutationQueuedError";
    }
}

export async function readMutationResponse<T>(response: Response, operation: string): Promise<T> {
    const data = await response.json().catch(() => ({}));
    if (data?.queued === true) {
        throw new MutationQueuedError(data.message);
    }
    if (!response.ok) {
        const serverMessage =
            typeof data?.error === "string" ? data.error : null;
        throw new Error(
            `${operation}: ${serverMessage ?? response.status}`,
        );
    }
    return data as T;
}

async function mutationHeaders(): Promise<Record<string, string>> {
    return authHeaders({
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
    });
}

export async function authHeaders(extra: Record<string, string> = {}) {
    const { data } = await supabase.auth.getSession();
    return {
        ...extra,
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    };
}

function validateUpload(file: File | null | undefined, kind: "image" | "audio") {
    if (!file) return;
    const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (file.size === 0 || file.size > maxBytes) {
        throw new Error(`${kind === "image" ? "Image" : "Audio"} files must be between 1 byte and ${maxBytes / 1024 / 1024}MB.`);
    }
    const allowedPrefix = kind === "image" ? "image/" : "audio/";
    if (!file.type.startsWith(allowedPrefix)) {
        throw new Error(`Please choose a valid ${kind} file.`);
    }
}

function readFileAsBase64(file: File): Promise<EncodedFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            const [, data = ""] = result.split(",");

            resolve({
                name: file.name,
                type: file.type,
                data,
            });
        };

        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
    });
}

async function encodeFile(file: File | null | undefined) {
    return file ? readFileAsBase64(file) : null;
}

export async function fetchSongs(signal?: AbortSignal) {
    const apiUrl = createApiUrl('/songs');
    const response = await fetch(apiUrl, { signal, headers: await authHeaders() });

    if (!response.ok) {
        throw new Error(`Failed to load songs: ${response.status}`);
    }

    const data: { songs?: Song[] } = await response.json();
    return Array.isArray(data.songs) ? data.songs : [];
}

export async function fetchSong(songId: string, signal?: AbortSignal) {
    const apiUrl = createApiUrl(`/songs/${encodeURIComponent(songId)}`);
    const response = await fetch(apiUrl, { signal, headers: await authHeaders() });

    if (!response.ok) {
        throw new Error(`Failed to load song: ${response.status}`);
    }

    const data: { song?: Song } = await response.json();
    if (!data.song) {
        throw new Error("Failed to load song");
    }
    return data.song;
}

export async function updateMeasure(songId: string, measureNumber: number, input: MeasureUpdateInput) {
    const apiUrl = createApiUrl(`/songs/${encodeURIComponent(songId)}/measures/${measureNumber}`);
    const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: await mutationHeaders(),
        body: JSON.stringify(input),
    });

    const data = await readMutationResponse<{ song?: Song }>(response, "Failed to update measure");
    if (!data.song) throw new Error('Failed to update measure');
    return data.song;
}

export async function createSong(input: CreateSongInput) {
    if (input.measureCount < 1 || input.measureCount > MAX_MEASURES || !Number.isInteger(input.measureCount)) {
        throw new Error(`Number of measures must be between 1 and ${MAX_MEASURES}.`);
    }
    if (!Number.isFinite(input.initialTempo) || input.initialTempo < 1 || input.initialTempo > MAX_TEMPO ||
        !Number.isFinite(input.targetTempo) || input.targetTempo < 1 || input.targetTempo > MAX_TEMPO) {
        throw new Error(`Tempo values must be between 1 and ${MAX_TEMPO} BPM.`);
    }
    validateUpload(input.imageFile, "image");
    validateUpload(input.audioFile, "audio");
    const apiUrl = createApiUrl('/songs/create');
    const [imageFile, audioFile] = await Promise.all([
        encodeFile(input.imageFile),
        encodeFile(input.audioFile),
    ]);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: await mutationHeaders(),
        body: JSON.stringify({
            title: input.title,
            subtitle: input.subtitle,
            composer: input.composer,
            measureCount: input.measureCount,
            initialTempo: input.initialTempo,
            targetTempo: input.targetTempo,
            imageFile,
            audioFile,
        }),
    });

    const data = await readMutationResponse<{ song?: Song; songs?: Song[] }>(response, "Failed to create song");

    if (!data.song) {
        throw new Error("Failed to create song");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}

export async function updateSong(songId: string, input: SongUpdateInput) {
    validateUpload(input.imageFile, "image");
    validateUpload(input.audioFile, "audio");
    const apiUrl = createApiUrl(`/songs/${encodeURIComponent(songId)}/update`);
    const [imageFile, audioFile] = await Promise.all([
        encodeFile(input.imageFile),
        encodeFile(input.audioFile),
    ]);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: await mutationHeaders(),
        body: JSON.stringify({
            title: input.title,
            subtitle: input.subtitle,
            composer: input.composer,
            archived: input.archived,
            imageFile,
            audioFile,
        }),
    });

    const data = await readMutationResponse<{ song?: Song; songs?: Song[] }>(response, "Failed to update song");

    if (!data.song) {
        throw new Error("Failed to update song");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}

export async function deleteSong(songId: string) {
    const apiUrl = createApiUrl(`/songs/${songId}`);

    const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: await mutationHeaders(),
    });

    const data = await readMutationResponse<{ songs?: Song[] }>(response, "Failed to delete song");

    return {
        songs: Array.isArray(data.songs) ? data.songs : [],
    };
}

export async function clearSongProgress(songId: string) {
    const apiUrl = createApiUrl(`/songs/${songId}/clear-progress`);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: await mutationHeaders(),
    });

    const data = await readMutationResponse<{ song?: Song; songs?: Song[] }>(response, "Failed to clear song progress");

    if (!data.song) {
        throw new Error("Failed to clear song progress");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}

export async function deleteMeasure(songId: string, measureNumber: number) {
    const apiUrl = createApiUrl(`/songs/${songId}/measures/${measureNumber}`);

    const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: await mutationHeaders(),
    });

    const data = await readMutationResponse<{ song?: Song; songs?: Song[] }>(response, "Failed to delete measure");

    if (!data.song) {
        throw new Error("Failed to delete measure");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}

export async function clearMeasureProgress(songId: string, measureNumber: number) {
    const apiUrl = createApiUrl(`/songs/${songId}/measures/${measureNumber}/clear-progress`);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: await mutationHeaders(),
    });

    const data = await readMutationResponse<{ song?: Song; songs?: Song[] }>(response, "Failed to clear measure progress");

    if (!data.song) {
        throw new Error("Failed to clear measure progress");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}
import { supabase } from "./supabase";
