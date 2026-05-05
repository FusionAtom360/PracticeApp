import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import type { Song } from "../../../lib/songs";
import {
    calculateSongProgress,
    calculateSongProgressBefore24h,
    calculateSongAverageTempo,
    calculateSongAverageAccuracy,
    calculateSongLastPracticeTime,
    formatLastPracticeTime,
    formatTimePracticed,
} from "../../../lib/songs";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import IconButton from "../../ui/IconButton/IconButton";
import Button from "../../ui/Button/Button";
import SongEdit from "../SongEdit/SongEdit";
import SongStats from "../../ui/SongStats/SongStats";
import { useSongs } from "../../../context/SongContext";
import "./SongHeader.css";

interface SongHeaderProps {
    song: Song | null;
}

const SongHeader: React.FC<SongHeaderProps> = ({ song }) => {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const navigate = useNavigate();
    const { updateSongOnServer, clearSelectedMeasures, playSong, setActiveSong } = useSongs();

    if (!song) {
        return null;
    }

    // Calculate overall progress from all measures
    const newProgress = calculateSongProgress(song);
    const oldProgress = calculateSongProgressBefore24h(song);

    // Calculate statistics for the song
    const stats = useMemo(() => {
        const tempo = calculateSongAverageTempo(song);
        const accuracy = calculateSongAverageAccuracy(song);
        const lastPracticeTimestamp = calculateSongLastPracticeTime(song);
        const lastPractice = formatLastPracticeTime(lastPracticeTimestamp);
        const timePracticed = formatTimePracticed(song.elapsedTime);

        return { tempo, accuracy, lastPractice, timePracticed };
    }, [song]);

    const handleSaveSong = async (payload: {
        song: Song;
        imageFile?: File | null;
        audioFile?: File | null;
    }) => {
        setIsSaving(true);
        try {
            await updateSongOnServer(payload.song.id, {
                title: payload.song.title,
                composer: payload.song.composer,
                imageFile: payload.imageFile,
                audioFile: payload.audioFile,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleArchiveSong = async () => {
        setIsSaving(true);
        try {
            await updateSongOnServer(song.id, { archived: !song.archived });
            navigate("/");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="song-header">
                <div className="header-title-section">
                    <h1 className="song-title">{song.title}</h1>
                    <p className="song-composer">{song.composer}</p>
                </div>
                <div className="header-grid">
                    <div className="header-left">
                        <div className="header-progress-section">
                            <span className="progress-label">
                                Overall Progress
                            </span>
                            <ProgressBar
                                new_value={newProgress}
                                old_value={oldProgress}
                            />
                        </div>
                    </div>

                    <div className="header-actions">
                        {/* <IconButton
                            Icon={AutoAwesomeOutlinedIcon}
                            label="Play"
                            className="header-action-btn header-guided-practice-btn"
                            onClick={() => {
                                clearSelectedMeasures();
                                navigate("/practice");
                            }}
                        /> */}
                        <div className="header-action-play">
                            <IconButton
                                Icon={PlayArrowOutlinedIcon}
                                label="Play"
                                className="header-action-btn header-action-btn--play"
                                onClick={() => {
                                    clearSelectedMeasures();
                                    setActiveSong(song.id);
                                    playSong(song.id);
                                }}
                            />
                        </div>
                        <div className="header-action-edit">
                            <IconButton
                                Icon={EditOutlinedIcon}
                                label="Edit"
                                className="header-action-btn header-action-btn--edit"
                                onClick={() => setIsEditOpen(true)}
                            />
                        </div>
                        <div className="header-action-archive">
                            <IconButton
                                Icon={
                                    song.archived
                                        ? UnarchiveOutlinedIcon
                                        : ArchiveOutlinedIcon
                                }
                                label={song.archived ? "Unarchive" : "Archive"}
                                className="header-action-btn header-action-btn--archive"
                                onClick={handleArchiveSong}
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                </div>
                <SongStats
                    timePracticed={stats.timePracticed}
                    tempo={stats.tempo}
                    accuracy={stats.accuracy}
                    lastPractice={stats.lastPractice}
                />
            </div>

            <SongEdit
                key={`${song.id}-${isEditOpen ? "open" : "closed"}`}
                isOpen={isEditOpen}
                song={song}
                onClose={() => setIsEditOpen(false)}
                onSave={handleSaveSong}
                isLoading={isSaving}
            />
        </>
    );
};

export default SongHeader;
