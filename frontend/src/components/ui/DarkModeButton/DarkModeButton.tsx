import { useEffect, useState } from "react";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import IconButton from "../IconButton/IconButton";

const THEME_STORAGE_KEY = "practiceapp.theme";

type ThemeMode = "light" | "dark";

function resolveInitialTheme(): ThemeMode {
    if (typeof window === "undefined") {
        return "light";
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
        return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(mode: ThemeMode) {
    if (typeof document === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.classList.toggle("theme-dark", mode === "dark");
    root.classList.toggle("theme-light", mode === "light");
}

export default function DarkModeButton() {
    const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialTheme);

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
