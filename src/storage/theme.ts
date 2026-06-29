/** Per-device theme preference. "system" follows prefers-color-scheme. */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "prodnote-theme";

export function getThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") {
    return "system";
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function setThemePreference(preference: ThemePreference): void {
  if (typeof localStorage !== "undefined") {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  }
  applyTheme();
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

/** Resolve the effective theme and apply it to the document root. */
export function applyTheme(): void {
  if (typeof document === "undefined") {
    return;
  }
  const preference = getThemePreference();
  const dark = preference === "dark" || (preference === "system" && prefersDark());
  if (dark) {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Call once on startup: apply now and react to system changes while on "system". */
export function initTheme(): void {
  applyTheme();
  if (typeof window !== "undefined" && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getThemePreference() === "system") {
        applyTheme();
      }
    });
  }
}
