import { useMemo, useState } from "react";
import { useParams } from "react-router";
import Metronome from "../../ui/Metronome/Metronome";
// import TuningDrone from "../../ui/TuningDrone/TuningDrone";
import { useSongs } from "../../../context/SongContext";
import "./PracticeSession.css";

// type DroneOption = {
//     note: string;
// };

export default function PracticeSession() {
    const { songId } = useParams();
    const decodedSongId = useMemo(() => {
        if (!songId) {
            return "Practice session";
        }

        return decodeURIComponent(songId);
    }, [songId]);
    const [tempo, setTempo] = useState(72);
    const [isPlaying, setIsPlaying] = useState(true);
    // const [selectedDrone, setSelectedDrone] = useState<DroneOption | null>(
    //     { note: "E" },
    // );
    const { selectedMeasures, songs } = useSongs();

    const song = useMemo(() => songs.find(s => s.id === decodedSongId) ?? null, [songs, decodedSongId]);
    const displayTitle = song?.title ?? decodedSongId;

    const activeMeasuresText = useMemo(() => {
        if (!selectedMeasures || selectedMeasures.length === 0) return "None selected";
        // If contiguous range, show as start-end
        const sorted = [...selectedMeasures].sort((a, b) => a - b);
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        if (end - start + 1 === sorted.length) {
            return `${start}–${end}`;
        }
        return sorted.join(", ");
    }, [selectedMeasures]);

    return (
        <main className="practice-session">
            <div className="practice-shell">
                <header className="practice-hero">
                    <div>
                        <p className="practice-kicker">Practice session</p>
                        <h1>{displayTitle}</h1>
                        <p className="practice-active">Active measures: {activeMeasuresText}</p>
                    </div>
                  </header>

                <div className="practice-grid">
                    <section className="practice-card">
                        <Metronome
                            tempo={tempo}
                            setTempo={setTempo}
                            isPlaying={isPlaying}
                            setIsPlaying={setIsPlaying}
                        />
                    </section>

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
