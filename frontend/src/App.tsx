import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SongProvider } from "./context/SongContext";
import SongSelection from "./components/pages/SongSelection/SongSelection";
import SongOverview from "./components/pages/SongOverview/SongOverview";
import PracticeSession from "./components/pages/PracticeSession/PracticeSession";
import CreateSong from "./components/pages/CreateSong/CreateSong";
import TopBar from "./components/layout/TopBar/TopBar";
import MiniPlayer from "./components/ui/MiniPlayer/MiniPlayer";

function App() {
    return (
        <BrowserRouter>
            <SongProvider>
                <div className="app">
                    <TopBar />
                    <MiniPlayer />
                    <Routes>
                        <Route path="/" element={<SongSelection />} />
                        <Route path="/create" element={<CreateSong />} />
                        <Route path="/songs/:songId" element={<SongOverview />} />
                        <Route path="/practice" element={<PracticeSession />} />
                        <Route path="/songs/:songId/practice" element={<PracticeSession />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </SongProvider>
        </BrowserRouter>
    );
}

export default App;
