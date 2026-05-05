import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router";
import Metronome from "../../ui/Metronome/Metronome";
// import TuningDrone from "../../ui/TuningDrone/TuningDrone";
import { useSongs } from "../../../context/SongContext";
import type { Measure } from "../../../lib/songs";
import "./PracticeSession.css";

// type DroneOption = {
//     note: string;
// };

export default function PracticeSession() {
    const { songId } = useParams();
    const decodedSongId = useMemo(() => {
        if (!songId) {
            return null;
        }

        return decodeURIComponent(songId);
    }, [songId]);
    const [isPlaying, setIsPlaying] = useState(false);
    // const [selectedDrone, setSelectedDrone] = useState<DroneOption | null>(
    //     { note: "E" },
    // );
    const { selectedMeasures, songs, addMetronomeEvent } = useSongs();

    const song = useMemo(
        () =>
            decodedSongId
                ? (songs.find((s) => s.id === decodedSongId) ?? null)
                : null,
        [songs, decodedSongId],
    );
    const displayTitle = song?.title ?? decodedSongId ?? "Free Practice";

    const { setActiveSong } = useSongs();

    useEffect(() => {
        setActiveSong(decodedSongId);
    }, [decodedSongId, setActiveSong]);

    const activeMeasuresText = useMemo(() => {
        if (!selectedMeasures || selectedMeasures.length === 0)
            return "None selected";
        if (selectedMeasures.length === 1) return String(selectedMeasures[0]);
        // If contiguous range, show as start-end
        const sorted = [...selectedMeasures].sort((a, b) => a - b);
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        if (end - start + 1 === sorted.length) {
            return `${start}–${end}`;
        }
        return sorted.join(", ");
    }, [selectedMeasures]);

    // Determine active measures' first measure object (if any)
    const activeMeasureObj = useMemo(() => {
        if (!song || !selectedMeasures || selectedMeasures.length === 0)
            return null;
        const firstNumber = selectedMeasures[0];
        return song.measures?.find((m) => m.number === firstNumber) ?? null;
    }, [song, selectedMeasures]);

    // Get all selected measure objects
    const selectedMeasureObjects = useMemo(() => {
        if (!song || !selectedMeasures || selectedMeasures.length === 0)
            return [];
        return selectedMeasures
            .map(num => song.measures?.find((m) => m.number === num))
            .filter((m): m is Measure => m !== undefined);
    }, [song, selectedMeasures]);

    const targetTempo = useMemo(() => {
        if (!song || !selectedMeasures || selectedMeasures.length === 0)
            return 120;

        // Get all selected measure objects
        const selectedMeasuresObjs = selectedMeasureObjects;

        if (selectedMeasuresObjs.length === 0) return 120;

        // Use the lowest target tempo from all selected measures
        const tempos = selectedMeasuresObjs.map(m => m.target ?? 120);
        return Math.min(...tempos);
    }, [song, selectedMeasureObjects, selectedMeasures]);

    const handlePracticeEvent = useCallback(
        async (outcome: "success" | "failure", bpm: number, elapsedSeconds: number) => {
            // If free mode (no songId), do not persist per-measure events, but still save free practice bpm to localStorage in Metronome
            if (!song || selectedMeasures.length === 0) return;

            await addMetronomeEvent(
                (song.id ?? "").trim(),
                outcome,
                bpm,
                selectedMeasures,
                elapsedSeconds,
            );
        },
        [song, selectedMeasures, addMetronomeEvent],
    );

    return (
        <main className="practice-session">
            <div className="practice-shell">
                <header className="practice-hero">
                    <div>
                        <p className="practice-kicker">Practice session</p>
                        <h1>{displayTitle}</h1>
                        <p className="practice-active">
                            {activeMeasuresText === "None selected"
                                ? ""
                                : `mm. ${activeMeasuresText}`}
                        </p>
                    </div>
                </header>

                <div className="practice-grid">
                    <Metronome
                        isPlaying={isPlaying}
                        setIsPlaying={setIsPlaying}
                        isFreeMode={!decodedSongId}
                        targetTempo={targetTempo}
                        measure={activeMeasureObj}
                        selectedMeasures={selectedMeasureObjects}
                        songId={song?.id}
                        onPracticeEvent={handlePracticeEvent}
                    />

                    {/* <section className="practice-card drone-stack">
                        <TuningDrone
                            selectedDrone={selectedDrone}
                            setSelectedDrone={setSelectedDrone}
                        />
                    </section> */}
                </div>
            </div>
        </main>
    );
}
