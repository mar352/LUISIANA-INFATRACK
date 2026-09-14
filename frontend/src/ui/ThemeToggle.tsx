import { useEffect, useState } from "react";
import { resolveTheme, toggleTheme, type Theme } from "../lib/theme";

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle({ className = "", iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<Theme>).detail;
      if (detail) setTheme(detail);
    };
    window.addEventListener("infatrack-theme", onTheme);
    return () => window.removeEventListener("infatrack-theme", onTheme);
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle${iconOnly ? " theme-toggle-icon-only" : " theme-toggle-pill"}${className ? ` ${className}` : ""}`}
      onClick={() => setTheme(toggleTheme())}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className="theme-toggle-icon" aria-hidden>
        {isDark ? <IconSun /> : <IconMoon />}
      </span>
      {!iconOnly && <span className="theme-toggle-label">{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
