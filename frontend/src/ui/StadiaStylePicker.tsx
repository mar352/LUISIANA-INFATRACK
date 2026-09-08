import {
  STADIA_MAP_STYLES,
  type StadiaMapStyleId,
  type StadiaMapStyleOption,
} from "../lib/stadia";

type Props = {
  currentStyle?: StadiaMapStyleId;
  onSelectStyle: (styleId: StadiaMapStyleId) => void;
  compact?: boolean;
};

export function StadiaStylePicker({
  currentStyle = "outdoors",
  onSelectStyle,
  compact = false,
}: Props) {
  return (
    <div className={`stadia-style-picker${compact ? " is-compact" : ""}`}>
      <div className="stadia-style-grid">
        {STADIA_MAP_STYLES.map((style: StadiaMapStyleOption) => {
          const isSelected = currentStyle === style.id;
          return (
            <button
              key={style.id}
              type="button"
              className={`stadia-style-card${isSelected ? " is-selected" : ""}`}
              onClick={() => onSelectStyle(style.id)}
              title={`${style.name} · ${style.tagline}`}
            >
              <div
                className="stadia-style-preview"
                style={{
                  background: style.previewBg,
                  color: style.textColor || "#151c28",
                }}
              >
                <span className="stadia-style-icon" aria-hidden>
                  {style.icon}
                </span>
                {isSelected && (
                  <span className="stadia-style-check" aria-hidden>
                    ✓
                  </span>
                )}
                {style.badge && !compact && (
                  <span className="stadia-style-badge">{style.badge}</span>
                )}
              </div>
              <div className="stadia-style-info">
                <div className="stadia-style-name">{style.name}</div>
                {!compact && (
                  <div className="stadia-style-tagline">{style.tagline}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
