import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createApiUrl, fetchSongs, saveSongs, updateSong, type Measure, type Song, type SongUpdateInput } from "../lib/songs";

const SELECTED_BY_SONG_STORAGE_KEY = "practiceapp.selectedMeasuresBySong";
const GLOBAL_KEY = "__global__";

function readPersistedSelectedBySong(): Record<string, number[]> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(SELECTED_BY_SONG_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const out: Record<string, number[]> = {};
            for (const k of Object.keys(parsed)) {
                const arr = parsed[k];
                if (Array.isArray(arr)) {
                    out[k] = arr.map((v: unknown) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
                }
            }
            return out;
        }
        return {};
    } catch {
        return {};
    }
}

interface SongContextType {
    songs: Song[];
    loading: boolean;
    error: Error | null;
    addRandomEvent: (id: string, measureNumber?: number) => Promise<void>;
    addPracticeEvent: (id: string, outcome: 'success' | 'failure', measureNumber?: number) => Promise<void>;
    addMetronomeEvent: (id: string, outcome: 'success' | 'failure', bpm: number, measureNumbers: number[], elapsedSeconds: number) => Promise<void>;
    saveSongsToServer: (songs: Song[]) => Promise<void>;
    updateSongOnServer: (songId: string, input: SongUpdateInput) => Promise<void>;
    reloadSongs: () => Promise<void>;
    selectedMeasures: number[];
    setSelectedMeasures: (start: number, end: number) => void;
    clearSelectedMeasures: () => void;
    setActiveSong: (songId: string | null) => void;
    setMeasureMode: (id: string, measureNumber: number, mode: 'rapid' | 'speed' | 'stability' | null) => Promise<void>;
    /* Audio player controls */
    playerSongId: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playSong: (songId: string) => void;
    togglePlay: () => void;
    seek: (seconds: number) => void;
    closePlayer: () => void;
}

const SongContext = createContext<SongContextType | undefined>(undefined);

export function SongProvider({ children }: { children: ReactNode }) {
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [selectedBySong, setSelectedBySong] = useState<Record<string, number[]>>(readPersistedSelectedBySong);
    const [currentSongId, setCurrentSongId] = useState<string | null>(null);
    const [playerSongId, setPlayerSongId] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fadeRef = useRef<number | null>(null);

    const fadeTo = useCallback((target: number, durationMs: number) => {
        return new Promise<void>((resolve) => {
            const a = audioRef.current;
            if (!a) return resolve();
            if (fadeRef.current) {
                cancelAnimationFrame(fadeRef.current);
                fadeRef.current = null;
            }
            const start = performance.now();
            const from = a.volume;
            const diff = target - from;

            const step = (now: number) => {
                const t = Math.min(1, (now - start) / durationMs);
                a.volume = Math.max(0, Math.min(1, from + diff * t));
                if (t < 1) {
                    fadeRef.current = requestAnimationFrame(step);
                } else {
                    fadeRef.current = null;
                    resolve();
                }
            };

            fadeRef.current = requestAnimationFrame(step);
        });
    }, []);
    const [selectedMeasuresState, setSelectedMeasuresState] = useState<number[]>([]);

    async function loadSongs(signal?: AbortSignal) {
        try {
            setLoading(true);
            const loadedSongs = await fetchSongs(signal);
            setSongs(loadedSongs);
            setError(null);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return;
            }

            setError(err instanceof Error ? err : new Error("Failed to load songs"));
            setSongs([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();

        loadSongs(controller.signal);

        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(SELECTED_BY_SONG_STORAGE_KEY, JSON.stringify(selectedBySong));
        } catch {
            // ignore
        }
    }, [selectedBySong]);

    

    const reloadSongs = useCallback(async () => {
        await loadSongs();
    }, []);

    const setSelectedMeasures = useCallback((start: number, end: number) => {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        const selected: number[] = [];
        for (let i = min; i <= max; i++) selected.push(i);

        const key = currentSongId ?? GLOBAL_KEY;
        setSelectedBySong((prev) => ({ ...prev, [key]: selected }));
        setSelectedMeasuresState(selected);
    }, [currentSongId]);

    const clearSelectedMeasures = useCallback(() => {
        const key = currentSongId ?? GLOBAL_KEY;
        setSelectedBySong((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
        setSelectedMeasuresState([]);
    }, [currentSongId]);

    const setActiveSong = useCallback((songId: string | null) => {
        setCurrentSongId(songId);
        const key = songId ?? GLOBAL_KEY;
        setSelectedMeasuresState(selectedBySong[key] ?? []);
    }, [selectedBySong]);

    // Audio player control functions
    const playSong = useCallback((songId: string) => {
        const song = songs.find(s => s.id === songId);
        if (!song) return;
        const src = song.audioUrl ?? song.audio ?? '';
        if (!src) return;
        setPlayerSongId(songId);
        try {
            if (!audioRef.current) audioRef.current = new Audio();
            // If another source was playing, fade it out then pause
            if (audioRef.current.src && audioRef.current.src !== src) {
                fadeTo(0, 120).finally(() => {
                    try { audioRef.current && audioRef.current.pause(); } catch {}
                });
            }
            audioRef.current.src = src;
            audioRef.current.currentTime = 0;
            // start muted and fade in
            audioRef.current.volume = 0;
            const p = audioRef.current.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    fadeTo(1, 150).then(() => setIsPlaying(true));
                }).catch(() => setIsPlaying(false));
            } else {
                fadeTo(1, 150).then(() => setIsPlaying(true));
            }
        } catch (err) {
            // ignore
        }
    }, [songs]);

    const togglePlay = useCallback(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) {
            // fade in when resuming
            a.volume = 0;
            const p = a.play();
            if (p && typeof p.then === 'function') {
                p.then(() => fadeTo(1, 150).then(() => setIsPlaying(true))).catch(() => setIsPlaying(false));
            } else {
                fadeTo(1, 150).then(() => setIsPlaying(true));
            }
        } else {
            // fade out quickly then pause
            fadeTo(0, 150).then(() => {
                try { a.pause(); } catch {}
                setIsPlaying(false);
            });
        }
    }, []);

    const closePlayer = useCallback(() => {
        const a = audioRef.current;
        if (!a) {
            setIsPlaying(false);
            setPlayerSongId(null);
            setCurrentTime(0);
            setDuration(0);
            return;
        }

        fadeTo(0, 150).then(() => {
            try {
                a.pause();
            } catch {}
            try {
                a.src = '';
            } catch {}
            setIsPlaying(false);
            setPlayerSongId(null);
            setCurrentTime(0);
            setDuration(0);
        }).catch(() => {
            try { a.pause(); } catch {}
            try { a.src = ''; } catch {}
            setIsPlaying(false);
            setPlayerSongId(null);
            setCurrentTime(0);
            setDuration(0);
        });
    }, [fadeTo]);

    const seek = useCallback((seconds: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = Math.max(0, Math.min(seconds, a.duration || Infinity));
        setCurrentTime(a.currentTime || 0);
    }, []);

    // Attach audio listeners
    useEffect(() => {
        if (!audioRef.current) return;
        const a = audioRef.current;
        const onTime = () => setCurrentTime(a.currentTime || 0);
        const onDur = () => setDuration(a.duration || 0);
        const onEnded = () => setIsPlaying(false);
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('durationchange', onDur);
        a.addEventListener('ended', onEnded);
        return () => {
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('durationchange', onDur);
            a.removeEventListener('ended', onEnded);
        };
    }, [playerSongId]);

    async function saveSongsToServerFn(songsToSave: Song[]) {
        try {
            setLoading(true);
            setError(null);
            const savedSongs = await saveSongs(songsToSave);
            setSongs(savedSongs);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to save songs'));
            throw err;
        } finally {
            setLoading(false);
        }
    }

    async function updateSongOnServerFn(songId: string, input: SongUpdateInput) {
        try {
            setLoading(true);
            setError(null);
            const updated = await updateSong(songId, input);
            setSongs(updated.songs);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to update song'));
            throw err;
        } finally {
            setLoading(false);
        }
    }

    async function addRandomEvent(id: string, measureNumber?: number) {
        setError(null);
        setLoading(true);

        try {
            // find song and clone state
            const prev = songs;
            const idx = prev.findIndex((s) => s.id === id);
            if (idx === -1) {
                throw new Error('Song not found');
            }

            const song = prev[idx];
            const measures = Array.isArray(song.measures) ? song.measures.slice() : [];

            const targetIndex = typeof measureNumber === 'number'
                ? measures.findIndex((m) => m.number === measureNumber)
                : Math.max(0, Math.floor(Math.random() * Math.max(1, measures.length)));

            const mi = targetIndex >= 0 ? targetIndex : 0;
            const existing = measures[mi] ?? { number: measureNumber ?? 1, current: 0, target: 0, events: [] };
            const events = Array.isArray((existing as any).events) ? (existing as any).events.slice() : [];

            const newEvent: any = {
                type: Math.random() > 0.5 ? 'metronome' : 'practice',
                outcome: Math.random() > 0.5 ? 'success' : 'failure',
                timestamp: Math.floor(Date.now() / 1000),
            };

            if (newEvent.type === 'metronome') {
                newEvent.value = 60 + Math.floor(Math.random() * 80);
            }

            events.push(newEvent);

            const updatedMeasure = { ...existing, events };
            measures[mi] = updatedMeasure;

            const updatedSong: Song = { ...song, measures };
            const updatedSongs = prev.slice();
            updatedSongs[idx] = updatedSong;

            setSongs(updatedSongs);

            // persist
            await saveSongs(updatedSongs);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to add event'));
            throw err;
        } finally {
            setLoading(false);
        }
    }

    async function addPracticeEvent(id: string, outcome: 'success' | 'failure', measureNumber?: number) {
        setError(null);

        try {
            if (!measureNumber || measureNumber < 1) {
                throw new Error('Valid measure number required');
            }

            const apiUrl = createApiUrl(`/songs/${encodeURIComponent(id)}/measures/${measureNumber}/events`);
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    outcome,
                    bpm: 0, // practice events don't have a BPM
                    type: 'practice',
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to add practice event: ${response.status}`);
            }

            // Reload songs to get the updated data
            await reloadSongs();
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to add practice event'));
            throw err;
        }
    }

    async function addMetronomeEvent(id: string, outcome: 'success' | 'failure', bpm: number, measureNumbers: number[], elapsedSeconds: number) {
        setError(null);

        try {
            if (!Array.isArray(measureNumbers) || measureNumbers.length === 0) {
                throw new Error('At least one measure number is required');
            }

            if (!Number.isFinite(bpm) || bpm < 1) {
                throw new Error('Valid BPM required');
            }

            if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
                throw new Error('Valid elapsed time required');
            }

            const measureNumber = measureNumbers[0];
            const apiUrl = createApiUrl(`/songs/${encodeURIComponent(id)}/measures/${measureNumber}/events`);
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    outcome,
                    bpm,
                    type: 'metronome',
                    measureNumbers,
                    elapsedSeconds,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to add metronome event: ${response.status}`);
            }

            // Reload songs to get the updated data
            await reloadSongs();
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to add metronome event'));
            throw err;
        }
    }

    async function setMeasureMode(id: string, measureNumber: number, mode: 'rapid' | 'speed' | 'stability' | null) {
        setError(null);
        setLoading(true);

        try {
            const prev = songs;
            const idx = prev.findIndex((s) => s.id === id);
            if (idx === -1) throw new Error('Song not found');

            const song = prev[idx];
            const measures = Array.isArray(song.measures) ? song.measures.slice() : [];
            const mi = measures.findIndex(m => m.number === measureNumber);
            if (mi === -1) throw new Error('Measure not found');

            const existing = measures[mi];
            const { mode: _existingMode, ...measureWithoutMode } = existing;
            const updatedMeasure: Measure = mode === null ? measureWithoutMode : { ...existing, mode };
            measures[mi] = updatedMeasure;

            const updatedSong: Song = { ...song, measures };
            const updatedSongs = prev.slice();
            updatedSongs[idx] = updatedSong;

            setSongs(updatedSongs);
            await saveSongs(updatedSongs);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to set measure mode'));
            throw err;
        } finally {
            setLoading(false);
        }
    }

    return (
        <SongContext.Provider value={{
            songs,
            loading,
            error,
            addRandomEvent,
            addPracticeEvent,
            addMetronomeEvent,
            setMeasureMode,
            saveSongsToServer: saveSongsToServerFn,
            updateSongOnServer: updateSongOnServerFn,
            reloadSongs,
            selectedMeasures: selectedMeasuresState,
            setSelectedMeasures,
            clearSelectedMeasures,
            setActiveSong,
            playerSongId,
            isPlaying,
            currentTime,
            duration,
            playSong,
            togglePlay,
            seek,
            closePlayer
        }}>
            {children}
        </SongContext.Provider>
    );
}

export function useSongs(): SongContextType {
    const context = useContext(SongContext);
    if (context === undefined) {
        throw new Error("useSongs must be used within a SongProvider");
    }
    return context;
}
