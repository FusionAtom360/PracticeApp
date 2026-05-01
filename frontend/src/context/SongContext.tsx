import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSongs, saveSongs, updateSong, type Song, type SongUpdateInput } from "../lib/songs";

interface SongContextType {
    songs: Song[];
    loading: boolean;
    error: Error | null;
    addRandomEvent: (id: string, measureNumber?: number) => Promise<void>;
    addPracticeEvent: (id: string, outcome: 'success' | 'failure', measureNumber?: number) => Promise<void>;
    saveSongsToServer: (songs: Song[]) => Promise<void>;
    updateSongOnServer: (songId: string, input: SongUpdateInput) => Promise<void>;
    reloadSongs: () => Promise<void>;
    isMultiSelectMode: boolean;
    toggleMultiSelectMode: () => void;
    selectedMeasures: number[];
    setSelectedMeasures: (start: number, end: number) => void;
    clearSelectedMeasures: () => void;
}

const SongContext = createContext<SongContextType | undefined>(undefined);

export function SongProvider({ children }: { children: ReactNode }) {
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
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

    async function reloadSongs() {
        await loadSongs();
    }

    function toggleMultiSelectMode() {
        setIsMultiSelectMode(prev => !prev);
        if (isMultiSelectMode) {
            setSelectedMeasuresState([]);
        }
    }

    function setSelectedMeasures(start: number, end: number) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        const selected: number[] = [];
        for (let i = min; i <= max; i++) {
            selected.push(i);
        }
        setSelectedMeasuresState(selected);
    }

    function clearSelectedMeasures() {
        setSelectedMeasuresState([]);
    }

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
        setLoading(true);

        try {
            const prev = songs;
            const idx = prev.findIndex((s) => s.id === id);
            if (idx === -1) {
                throw new Error('Song not found');
            }

            const song = prev[idx];
            const measures = Array.isArray(song.measures) ? song.measures.slice() : [];

            const targetIndex = typeof measureNumber === 'number'
                ? measures.findIndex((m) => m.number === measureNumber)
                : 0;

            const mi = targetIndex >= 0 ? targetIndex : 0;
            const existing = measures[mi] ?? { number: measureNumber ?? 1, current: 0, target: 0, events: [] };
            const events = Array.isArray((existing as any).events) ? (existing as any).events.slice() : [];

            const newEvent: any = {
                type: 'practice',
                outcome,
                timestamp: Math.floor(Date.now() / 1000),
            };

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
            setError(err instanceof Error ? err : new Error('Failed to add practice event'));
            throw err;
        } finally {
            setLoading(false);
        }
    }

    return (
        <SongContext.Provider value={{ songs, loading, error, addRandomEvent, addPracticeEvent, saveSongsToServer: saveSongsToServerFn, updateSongOnServer: updateSongOnServerFn, reloadSongs, isMultiSelectMode, toggleMultiSelectMode, selectedMeasures: selectedMeasuresState, setSelectedMeasures, clearSelectedMeasures }}>
            {children}
        </SongContext.Provider>
    );
}

export function useSongs(): SongContextType {
    const context = useContext(SongContext);
    if (context === undefined) {
        throw new Error("useSongs must be used within a SongProvider");
    }
    console.log("useSongs context value:", context);
    return context;
}
