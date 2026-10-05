import { useEffect, useState } from "react";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import IconButton from "../IconButton/IconButton";
import { applyTheme, getInitialTheme, THEME_STORAGE_KEY, type ThemeMode } from "../../../lib/theme";

export default function DarkModeButton() {
    const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

    useEffect(() => {
        applyTheme(themeMode);
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    }, [themeMode]);

    return (
        <IconButton
            Icon={DarkModeOutlinedIcon}
            label={
                themeMode === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
            onClick={() =>
                setThemeMode((prevMode) =>
                    prevMode === "dark" ? "light" : "dark",
                )
            }
        />
    );
}
