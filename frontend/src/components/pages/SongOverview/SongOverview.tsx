import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useSongs } from "../../../context/SongContext";
import { fetchSong, type Song } from "../../../lib/songs";
import SongHeader from "../../layout/SongHeader/SongHeader";
import MeasuresOverview from "../../ui/MeasuresOverview/MeasuresOverview";
import "./SongOverview.css";

export default function SongOverview() {
    const { songId } = useParams();
    const { songs } = useSongs();
    const [detailedSong, setDetailedSong] = useState<Song | null>(null);
    const [loadError, setLoadError] = useState<Error | null>(null);

    const summarySong = useMemo(() => {
        const decodedId = songId ? decodeURIComponent(songId) : "";
        return songs.find((entry) => (entry.id ?? "").trim() === decodedId) ?? null;
    }, [songId, songs]);

    useEffect(() => {
        const decodedId = songId ? decodeURIComponent(songId) : "";
        if (!decodedId) return;

        const controller = new AbortController();
        setDetailedSong(null);
        setLoadError(null);
        fetchSong(decodedId, controller.signal)
            .then(setDetailedSong)
            .catch((error) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                setLoadError(error instanceof Error ? error : new Error("Failed to load song"));
            });

        return () => controller.abort();
    }, [songId]);

    const song = useMemo(() => {
        if (!summarySong) return detailedSong;
        if (!detailedSong) return summarySong;

        const detailedMeasures = new Map(
            (detailedSong.measures ?? []).map((measure) => [measure.number, measure]),
        );
        return {
            ...summarySong,
            ...detailedSong,
            measures: (summarySong.measures ?? []).map((measure) => ({
                ...measure,
                ...(detailedMeasures.get(measure.number) ?? {}),
            })),
        };
    }, [summarySong, detailedSong]);

    if (!song) {
        if (loadError) {
            return (
                <main className="song-overview">
                    <h1>Unable to load piece</h1>
                    <p>{loadError.message}</p>
                </main>
            );
        }
        return (
            <main className="song-overview">
                <h1>Piece not found</h1>
            </main>
        );
    }

    return (
        <main className="song-overview">
            <SongHeader song={song} />
            <MeasuresOverview song={song} />
        </main>
    );
}
