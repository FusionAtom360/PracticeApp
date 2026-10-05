export const THEME_STORAGE_KEY = "practiceapp.theme";

export type ThemeMode = "light" | "dark";

export function getSystemTheme(): ThemeMode {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function getInitialTheme(): ThemeMode {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : getSystemTheme();
}

export function applyTheme(mode: ThemeMode) {
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.classList.toggle("theme-dark", mode === "dark");
    document.documentElement.classList.toggle("theme-light", mode === "light");
}
