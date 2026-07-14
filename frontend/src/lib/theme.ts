export type Theme = "light" | "dark";

const STORAGE_KEY = "infatrack-theme";

export function getStoredTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function resolveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("infatrack-theme", { detail: theme }));
}

export function initTheme() {
  applyTheme(resolveTheme());
}

export function toggleTheme(): Theme {
  const next: Theme = resolveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function subscribeTheme(callback: (theme: Theme) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Theme>).detail;
    callback(detail ?? resolveTheme());
  };
  window.addEventListener("infatrack-theme", handler);
  return () => window.removeEventListener("infatrack-theme", handler);
}
