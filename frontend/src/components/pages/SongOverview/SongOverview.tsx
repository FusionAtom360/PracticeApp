import { useMemo } from "react";
import { useParams } from "react-router";
import { useSongs } from "../../../context/SongContext";
import SongHeader from "../../layout/SongHeader/SongHeader";
import MeasuresOverview from "../../ui/MeasuresOverview/MeasuresOverview";
import "./SongOverview.css";

export default function SongOverview() {
    const { songId } = useParams();
    const { songs } = useSongs();

    const song = useMemo(() => {
        const decodedId = songId ? decodeURIComponent(songId) : "";
        return songs.find((entry) => (entry.id ?? "").trim() === decodedId) ?? null;
    }, [songId, songs]);

    if (!song) {
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
