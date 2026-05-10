import React, { useMemo } from "react";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import IconButton from "../IconButton/IconButton";
import { useSongs } from "../../../context/SongContext";
import "./MiniPlayer.css";

export default function MiniPlayer() {
    const {
        songs,
        playerSongId,
        isPlaying,
        currentTime,
        duration,
        togglePlay,
        seek,
        closePlayer,
    } = useSongs();

    const song = useMemo(
        () => songs.find((s) => s.id === playerSongId) ?? null,
        [songs, playerSongId],
    );

    if (!song) return <div className="mini-player-mini mini-player-hidden" />;

    const format = (sec: number) => {
        if (!isFinite(sec) || sec <= 0) return "0:00";
        const s = Math.floor(sec % 60)
            .toString()
            .padStart(2, "0");
        const m = Math.floor(sec / 60);
        return `${m}:${s}`;
    };

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        seek(v);
    };

    const pct =
        duration && duration > 0
            ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
            : 0;

    return (
        <div
            className="mini-player"
            role="region"
            aria-label="Mini audio player"
        >
            <div className="controls">
                <div className="play-btn">
                    <IconButton
                        Icon={
                            isPlaying
                                ? PauseOutlinedIcon
                                : PlayArrowOutlinedIcon
                        }
                        label={isPlaying ? "Pause" : "Play"}
                        onClick={togglePlay}
                    />
                </div>
            </div>

            <div className="scrub">
                <input
                    type="range"
                    min={0}
                    step={0.01}
                    max={duration || 0}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={handleScrub}
                    style={{
                        background: `linear-gradient(90deg, var(--accent-warm) ${pct}%, var(--surface-2) ${pct}%)`,
                        transition: "background 120ms linear",
                    }}
                />
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.85rem",
                        marginTop: "0.25rem",
                    }}
                >
                    <div className="time">{format(currentTime)}</div>
                    <div className="time">{format(duration)}</div>
                </div>
            </div>
            <div className="controls">
                <div className="close-btn">
                    <IconButton
                        Icon={CloseOutlinedIcon}
                        label="Close player"
                        onClick={closePlayer}
                    />
                </div>{" "}
            </div>

            <div className="meta">
                <div className="title">{song.title}</div>
                <div className="time">{song.composer}</div>
            </div>
        </div>
    );
}
