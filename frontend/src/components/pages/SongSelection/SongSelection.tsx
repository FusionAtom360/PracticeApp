import { useNavigate } from "react-router";
import SongCard from "../../ui/SongCard/SongCard";
import Button from "../../ui/Button/Button";
import { useSongs } from "../../../context/SongContext";
import type { Song } from "../../../lib/songs";
import "./SongSelection.css";

export default function SongSelection() {
    const { songs } = useSongs();
    const navigate = useNavigate();
    const getLatestTimestamp = (song: Song): number => {
        if (!song || !Array.isArray(song.measures) || song.measures.length === 0) return 0;
        let max = 0;
        for (const m of song.measures) {
            if (!m || !Array.isArray(m.events) || m.events.length === 0) continue;
            for (const e of m.events) {
                const ts = Number(e && e.timestamp) || 0;
                if (ts > max) max = ts;
            }
        }
        return max;
    };

    const currentSongs = songs
        .filter((song) => !song.archived)
        .slice()
        .sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));

    const archivedSongs = songs
        .filter((song) => song.archived)
        .slice()
        .sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));

    return (
        <main className="song-selection">
            <section className="song-section">
                <div className="song-header">
                    <div>
                        <p className="song-eyebrow">Library</p>
                        <h1 className="song-title">Current pieces</h1>
                    </div>
                    <Button label="Create new piece" onClick={() => navigate("/create")} />
                </div>

                <div className="song-grid">
                    {currentSongs.map((song) => (
                        <SongCard
                            key={(song.id ?? "").trim() || `${song.title}-${song.composer}`}
                            title={song.title}
                            artist={song.composer}
                            imageSrc={song.imageUrl}
                            onClick={() => navigate(`/songs/${encodeURIComponent((song.id ?? "").trim())}`)}
                        />
                    ))}
                </div>
            </section>

            {archivedSongs.length > 0 ? (
                <section className="song-section song-section--archived">
                    <div className="song-header">
                        <div>
                            <p className="song-eyebrow">Library</p>
                            <h2 className="song-title song-title--archived">Archived pieces</h2>
                        </div>
                    </div>

                    <div className="song-grid">
                        {archivedSongs.map((song) => (
                            <SongCard
                                key={(song.id ?? "").trim() || `${song.title}-${song.composer}`}
                                title={song.title}
                                artist={song.composer}
                                imageSrc={song.imageUrl}
                                onClick={() => navigate(`/songs/${encodeURIComponent((song.id ?? "").trim())}`)}
                            />
                        ))}
                    </div>
                </section>
            ) : null}
        </main>
    );
}
