import { useNavigate, useMatch } from "react-router";
import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import PianoIcon from "@mui/icons-material/PianoOutlined";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMoreOutlined";
import DarkModeButton from "../../ui/DarkModeButton/DarkModeButton";
import IconButton from "../../ui/IconButton/IconButton";
import { useSongs } from "../../../context/SongContext";
import "./TopBar.css";

export default function TopBar() {
    const navigate = useNavigate();
    const { isMultiSelectMode, toggleMultiSelectMode } = useSongs();
    const isSongOverview = !!useMatch("/songs/:songId");

    return (
        <header className="top-bar" role="banner">
            <div className="top-bar__inner">
                <div className="top-bar__left">
                    <IconButton Icon={ArrowBackIcon} label="Go back" onClick={() => navigate(-1)} />
                    <IconButton Icon={HomeIcon} label="Go to home" onClick={() => navigate("/")} />
                </div>
                <div className="top-bar__right">
                    {isSongOverview && (
                        <IconButton
                            Icon={UnfoldMoreIcon}
                            label={isMultiSelectMode ? "Exit multi-select" : "Multi-select"}
                            onClick={toggleMultiSelectMode}
                            className={isMultiSelectMode ? "top-bar__multi-select--active" : ""}
                        />
                    )}
                    <IconButton Icon={PianoIcon} label="Open piano" />
                    <DarkModeButton />
                </div>
            </div>
        </header>
    );
}
