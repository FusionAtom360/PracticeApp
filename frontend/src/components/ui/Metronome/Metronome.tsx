import { useEffect, useState } from "react";
import Button from "../Button/Button";
import "./Metronome.css";

const beatCount = [1, 2, 3, 4];

function getTempoName(bpm: number) {
    if (bpm < 60) {
        return "Lento";
    }

    if (bpm < 76) {
        return "Andante";
    }

    if (bpm < 108) {
        return "Moderato";
    }

    if (bpm < 132) {
        return "Allegro";
    }

    return "Presto";
}

interface MetronomeProps {
    tempo: number;
    setTempo: (tempo: number) => void;
    isPlaying: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
}

export default function Metronome({
    tempo,
    setTempo,
    isPlaying,
    setIsPlaying,
}: MetronomeProps) {
    const [activeBeat, setActiveBeat] = useState(0);
    const tempoName = getTempoName(tempo);

    useEffect(() => {
        if (!isPlaying) {
            return undefined;
        }

        const intervalMs = Math.max(240, 60000 / tempo);
        const timer = window.setInterval(() => {
            setActiveBeat((beat) => (beat + 1) % beatCount.length);
        }, intervalMs);

        return () => window.clearInterval(timer);
    }, [isPlaying, tempo]);

    return (
        <div className="metronome-shell">
            <div className="main-controls-row">
                <Button
                    variant="ghost"
                    size="lg"
                    className="tempo-adjust-btn"
                    aria-label="Decrease tempo"
                    onClick={() => setTempo(Math.max(40, tempo - 1))}
                >
                    −
                </Button>

                <div className="tempo-circle" aria-label="Tempo display">
                    <div className="bpm-display">
                        <div className="tempo-name">{tempoName}</div>
                        <div className="pulse-row">
                            <span
                                className={`pulse-indicator ${isPlaying ? "is-playing" : ""}`}
                                aria-hidden="true"
                            />
                            <span className="bpm-number">{tempo}</span>
                        </div>
                        <div className="bpm-label">BPM</div>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="lg"
                    className="tempo-adjust-btn"
                    aria-label="Increase tempo"
                    onClick={() => setTempo(Math.min(180, tempo + 1))}
                >
                    +
                </Button>
            </div>

            <div className="play-controls">
                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control"
                    aria-label="Settings"
                >
                    <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                    >
                        settings
                    </span>
                </Button>

                <Button
                    variant="warm"
                    size="lg"
                    className="play-control-btn"
                    aria-label={
                        isPlaying ? "Pause metronome" : "Play metronome"
                    }
                    onClick={() => setIsPlaying(!isPlaying)}
                >
                    <span
                        className="material-symbols-outlined play-icon"
                        aria-hidden="true"
                    >
                        {isPlaying ? "pause" : "play_arrow"}
                    </span>
                </Button>

                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control"
                    aria-label="Practice"
                >
                    <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                    >
                        piano
                    </span>
                </Button>
            </div>

            <div className="metronome-meter" aria-label="Beat pattern">
                {beatCount.map((beat, index) => (
                    <div
                        key={beat}
                        className={`beat-pill ${activeBeat === index ? "is-active" : ""}`}
                    >
                        {beat}
                    </div>
                ))}
            </div>

            <div className="metronome-controls">
                <div className="tempo-control">
                    <div className="tempo-value-row">
                        <label htmlFor="tempo-range">Tempo fine tune</label>
                        <span className="tempo-value">{tempo} BPM</span>
                    </div>
                    <input
                        id="tempo-range"
                        type="range"
                        min="40"
                        max="180"
                        step="1"
                        value={tempo}
                        onChange={(event) =>
                            setTempo(Number(event.target.value))
                        }
                        className="tempo-track"
                    />
                </div>

                <div className="metronome-actions">
                    <Button
                        variant="ghost"
                        size="md"
                        onClick={() => setTempo(72)}
                    >
                        Reset
                    </Button>
                </div>
            </div>
        </div>
    );
}
