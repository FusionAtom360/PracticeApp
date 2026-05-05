export interface Measure {
    current: number;
    target: number;
    elapsedTime?: number;
    recent?: boolean[];
    number?: number;
    events?: Array<{
        timestamp?: number | string;
        type?: string;
        value?: any;
        outcome?: any;
    }>;
    ignoreTempo?: boolean;
    mode?: 'rapid' | 'speed' | 'stability';
}

export interface Song {
    id: string;
    title: string;
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

export function calculateMeasureProgress(measure: Measure): number {
    if (!measure || measure.target <= 0) return 0;

    const target = measure.target;

    // Calculate currentTempo
    let currentTempo = 0;
    if (measure.ignoreTempo) {
        currentTempo = target;
    } else {
        // Get the last metronome event with a tempo marking
        const events = Array.isArray(measure.events) ? measure.events : [];
        for (let i = events.length - 1; i >= 0; i--) {
            const event = events[i];
            if (event && event.type === 'metronome' && typeof event.value === 'number') {
                currentTempo = event.value;
                break;
            }
        }
    }

    const tempoRatio = currentTempo / target;

    // Count successes in last 50 attempts
    const events = Array.isArray(measure.events) ? measure.events : [];
    const lastFiftyEvents = events.slice(-50);
    const successCount = lastFiftyEvents.filter(e => e && e.outcome === 'success').length;
    // If fewer than 50 events, count missing as failures
    const successRatio = successCount / 50;

    // Calculate days since last practiced
    let daysSinceLastPracticed = 0;
    if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        if (lastEvent && typeof lastEvent.timestamp === 'number') {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const secondsElapsed = nowSeconds - lastEvent.timestamp;
            daysSinceLastPracticed = Math.floor(secondsElapsed / (24 * 60 * 60));
        }
    }

    // Apply decay penalty
    const decayPenalty = Math.pow(0.98, daysSinceLastPracticed);

    // Calculate final progress
    const progress = tempoRatio * successRatio * decayPenalty;
    return Math.max(0, Math.min(1, progress)); // Clamp between 0 and 1
}

export function calculateMeasureProgressBefore24h(measure: Measure): number {
    if (!measure || measure.target <= 0) return 0;

    const target = measure.target;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgoSeconds = nowSeconds - (24 * 60 * 60);

    // Get all events from before 24 hours ago
    const events = Array.isArray(measure.events) ? measure.events : [];
    const eventsBefore24h = events.filter(e => e && typeof e.timestamp === 'number' && e.timestamp < twentyFourHoursAgoSeconds);
    
    // If no events exist before 24 hours ago, return 0 (no progress data from before the period)
    if (eventsBefore24h.length === 0) return 0;

    // Calculate currentTempo from events before 24h
    let currentTempo = 0;
    if (measure.ignoreTempo) {
        currentTempo = target;
    } else {
        // Get the last metronome event before 24h with a tempo marking
        for (let i = eventsBefore24h.length - 1; i >= 0; i--) {
            const event = eventsBefore24h[i];
            if (event && event.type === 'metronome' && typeof event.value === 'number') {
                currentTempo = event.value;
                break;
            }
        }
    }

    const tempoRatio = currentTempo / target;

    // Count successes in last 50 attempts before 24h
    const lastFiftyEventsBefore24h = eventsBefore24h.slice(-50);
    const successCount = lastFiftyEventsBefore24h.filter(e => e && e.outcome === 'success').length;
    const successRatio = successCount / 50;

    // Calculate days since last practiced (before 24h)
    let daysSinceLastPracticed = 0;
    if (eventsBefore24h.length > 0) {
        const lastEvent = eventsBefore24h[eventsBefore24h.length - 1];
        if (lastEvent && typeof lastEvent.timestamp === 'number') {
            const secondsElapsed = nowSeconds - lastEvent.timestamp;
            daysSinceLastPracticed = Math.floor(secondsElapsed / (24 * 60 * 60));
        }
    }

    // Apply decay penalty
    const decayPenalty = Math.pow(0.98, daysSinceLastPracticed);

    // Calculate final progress
    const progress = tempoRatio * successRatio * decayPenalty;
    return Math.max(0, Math.min(1, progress)); // Clamp between 0 and 1
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

        let currentTempo = 0;
        if (measure.ignoreTempo) {
            currentTempo = measure.target || 0;
        } else {
            // Get the last metronome event with a tempo marking
            const events = Array.isArray(measure.events) ? measure.events : [];
            for (let i = events.length - 1; i >= 0; i--) {
                const event = events[i];
                if (event && event.type === 'metronome' && typeof event.value === 'number') {
                    currentTempo = event.value;
                    break;
                }
            }
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

        const events = Array.isArray(measure.events) ? measure.events : [];
        const lastFiftyEvents = events.slice(-50);
        
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

        const events = Array.isArray(measure.events) ? measure.events : [];
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
    composer?: string;
    archived?: boolean;
    imageFile?: File | null;
    audioFile?: File | null;
}

export interface CreateSongInput {
    title: string;
    composer: string;
    measureCount: number;
    initialTempo: number;
    targetTempo: number;
    imageFile?: File | null;
    audioFile?: File | null;
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
    const apiUrl = `http://${window.location.hostname}:3001/songs`;
    const response = await fetch(apiUrl, { signal });

    if (!response.ok) {
        throw new Error(`Failed to load songs: ${response.status}`);
    }

    const data: { songs?: Song[] } = await response.json();
    return Array.isArray(data.songs) ? data.songs : [];
}

export async function saveSongs(songs: Song[]) {
    const apiUrl = `http://${window.location.hostname}:3001/songs`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs }),
    });

    if (!response.ok) {
        throw new Error(`Failed to save songs: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.songs) ? data.songs : [];
}

export async function createSong(input: CreateSongInput) {
    const apiUrl = `http://${window.location.hostname}:3001/songs/create`;
    const [imageFile, audioFile] = await Promise.all([
        encodeFile(input.imageFile),
        encodeFile(input.audioFile),
    ]);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: input.title,
            composer: input.composer,
            measureCount: input.measureCount,
            initialTempo: input.initialTempo,
            targetTempo: input.targetTempo,
            imageFile,
            audioFile,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create song: ${response.status}`);
    }

    const data: { song?: Song; songs?: Song[] } = await response.json();

    if (!data.song) {
        throw new Error("Failed to create song");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}

export async function updateSong(songId: string, input: SongUpdateInput) {
    const apiUrl = `http://${window.location.hostname}:3001/songs/${encodeURIComponent(songId)}/update`;
    const [imageFile, audioFile] = await Promise.all([
        encodeFile(input.imageFile),
        encodeFile(input.audioFile),
    ]);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: input.title,
            composer: input.composer,
            archived: input.archived,
            imageFile,
            audioFile,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to update song: ${response.status}`);
    }

    const data: { song?: Song; songs?: Song[] } = await response.json();

    if (!data.song) {
        throw new Error("Failed to update song");
    }

    return {
        song: data.song,
        songs: Array.isArray(data.songs) ? data.songs : [data.song],
    };
}
