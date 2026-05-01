import { useState } from "react";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import "./SongCard.css";

interface SongCardProps {
    title?: string;
    artist?: string;
    imageSrc?: string | null;
    onClick?: () => void;
}

function SongCard({
    title = "Song Title",
    artist = "Artist Name",
    imageSrc,
    onClick,
}: SongCardProps) {
    const [imageError, setImageError] = useState(false);

    const handleImageError = () => {
        setImageError(true);
    };

    return (
        <button className="song-card" type="button" onClick={onClick}>
            <div className="song-card-img">
                {imageSrc && !imageError ? (
                    <img
                        src={imageSrc}
                        alt="Album Cover"
                        onError={handleImageError}
                    />
                ) : (
                    <div className="song-card-img-fallback">
                        <MusicNoteIcon sx={{ fontSize: "3rem" }} />
                    </div>
                )}
            </div>
            <div className="song-card-info">
                <h3>{title}</h3>
                <p>{artist}</p>
            </div>
        </button>
    );
}

export default SongCard;
