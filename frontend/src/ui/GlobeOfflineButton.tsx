import { useEffect, useRef, useState } from "react";
import {
  downloadGlobePack,
  globePackEstimate,
  isGlobeOfflineMode,
  OFFLINE_MODE_EVENT,
  readGlobePackMeta,
  setGlobeOfflineMode,
} from "../lib/globe-offline";

export function GlobeOfflineButton() {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [on, setOn] = useState(isGlobeOfflineMode);
  const [meta, setMeta] = useState(readGlobePackMeta);
  const abortRef = useRef<AbortController | null>(null);
  const estimate = globePackEstimate();

  useEffect(() => {
    setMeta(readGlobePackMeta());
    setOn(isGlobeOfflineMode());
    const sync = () => setOn(isGlobeOfflineMode());
    window.addEventListener(OFFLINE_MODE_EVENT, sync);
    return () => window.removeEventListener(OFFLINE_MODE_EVENT, sync);
  }, []);

  async function toggle() {
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    if (on) {
      setGlobeOfflineMode(false);
      setOn(false);
      return;
    }
    if (!readGlobePackMeta()) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setPct(0);
      try {
        const next = await downloadGlobePack((done, total) => {
          setPct(total ? Math.round((done / total) * 100) : 0);
        }, ctrl.signal);
        setMeta(next);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.warn("[globe-offline]", err);
        }
        setBusy(false);
        abortRef.current = null;
        return;
      }
      setBusy(false);
      abortRef.current = null;
    }
    setGlobeOfflineMode(true);
    setOn(true);
  }

  const label = busy ? `Downloading ${pct}%` : on ? "Offline on" : "Offline mode";
  const title = busy
    ? "Downloading Luisiana tiles — click to cancel"
    : on
      ? "Offline mode on — using saved Luisiana tiles. Click to go live."
      : meta
        ? "Use saved Luisiana tiles (no live MapTiler/OSM). Click to turn on."
        : `First click downloads ~${estimate.tiles} tiles, then turns Offline mode on.`;

  return (
    <>
      <button
        type="button"
        className={`map-shortcut${on && !busy ? " is-on" : ""}${busy ? " is-busy" : ""}`}
        title={title}
        aria-label={title}
        aria-pressed={on}
        onClick={() => void toggle()}
      >
        {busy ? (
          <span className="map-offline-pct">{pct}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5a7 7 0 0 1 14 0" />
            <path d="M8.5 12.5a3.5 3.5 0 0 1 7 0" />
            <path d="M12 16h.01" />
            <path d="M4 5l16 14" />
          </svg>
        )}
        <span className="map-shortcut-label">{label}</span>
      </button>
      {busy && (
        <div className="map-offline-hud" role="status" aria-live="polite">
          <div className="map-offline-hud-label">Downloading Luisiana tiles {pct}%</div>
          <div className="map-offline-hud-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="map-offline-hud-hint">Then Offline mode turns on. Click the icon to cancel.</div>
        </div>
      )}
    </>
  );
}
