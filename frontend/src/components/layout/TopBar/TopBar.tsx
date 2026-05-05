import { useNavigate } from "react-router";
import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import PianoIcon from "@mui/icons-material/PianoOutlined";
// import BarChartIcon from "@mui/icons-material/BarChartOutlined";
import DarkModeButton from "../../ui/DarkModeButton/DarkModeButton";
import IconButton from "../../ui/IconButton/IconButton";
import StatusIndicator from "../../ui/StatusIndicator/StatusIndicator";
import { useSongs } from "../../../context/SongContext";
import "./TopBar.css";

export default function TopBar() {
    const navigate = useNavigate();
    const { clearSelectedMeasures } = useSongs();

    return (
        <header className="top-bar" role="banner">
            <div className="top-bar__inner">
                <div className="top-bar__left">
                    <IconButton
                        Icon={ArrowBackIcon}
                        label="Go back"
                        onClick={() => navigate(-1)}
                    />
                    <IconButton
                        Icon={HomeIcon}
                        label="Go to home"
                        onClick={() => navigate("/")}
                    />
                    <StatusIndicator />
                </div>
                <div className="top-bar__right">
                    {/* <IconButton
                        Icon={BarChartIcon}
                        label="Open statistics"
                        onClick={() => {
                            navigate("/statistics");
                        }}
                    /> */}
                    <IconButton
                        Icon={PianoIcon}
                        label="Open piano"
                        onClick={() => {
                            clearSelectedMeasures();
                            navigate("/practice");
                        }}
                    />
                    <DarkModeButton />
                </div>
            </div>
        </header>
    );
}
