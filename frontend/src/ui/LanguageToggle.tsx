import { useTranslation } from "../lib/i18n";
import "./LanguageToggle.css";

export { useTranslation };

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useTranslation();

  return (
    <div className={`infatrack-lang-toggle ${className}`} role="group" aria-label="Language selector">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lang-globe-icon"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <button
        type="button"
        className={`lang-btn-opt${language === "tl" ? " is-active" : ""}`}
        onClick={() => setLanguage("tl")}
        title="Tagalog / Filipino"
        aria-pressed={language === "tl"}
      >
        TL
      </button>
      <span className="lang-sep">|</span>
      <button
        type="button"
        className={`lang-btn-opt${language === "en" ? " is-active" : ""}`}
        onClick={() => setLanguage("en")}
        title="English"
        aria-pressed={language === "en"}
      >
        EN
      </button>
    </div>
  );
}

export default LanguageToggle;
