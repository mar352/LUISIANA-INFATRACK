import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { backendUrl } from "../lib/api";
import { useTranslation } from "../lib/i18n";
import "./ProjectChat.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function ProjectChat() {
  const { isEn } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, fullscreen, busy]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, fullscreen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) {
          setFullscreen(false);
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, fullscreen]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(backendUrl("/api/chat"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.hint || `Chat failed (${res.status})`);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: String(data.reply || "") },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: msg.includes("Model not found") || msg.includes("pull")
            ? `The Llama model is not installed yet. In a terminal run:\nollama pull llama3.2:1b\n\nThen try again. (${msg})`
            : `Chat backend error: ${msg}\n\nMake sure Ollama is running and the API backend is up.`,
        },
      ]);
    }
    setBusy(false);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function closePanel() {
    setOpen(false);
    setFullscreen(false);
  }

  return (
    <>
      <div className="project-chat-root">
        {!open && (
          <button
            type="button"
            className="project-chat-fab"
            onClick={() => setOpen(true)}
            title={isEn ? "INFA-TRACK AI Help Chat" : "Tulong ng AI sa INFA-TRACK"}
            aria-label={isEn ? "Open project help chat" : "Buksan ang chat para sa tulong"}
          >
            <span className="project-chat-fab-icon">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="project-chat-fab-text">{isEn ? "Help" : "Tulong"}</span>
            <span className="project-chat-fab-badge">AI</span>
          </button>
        )}
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="project-chat-backdrop"
              aria-label={isEn ? "Close chat" : "Isara ang chat"}
              onClick={closePanel}
            />
            <div
              className={`project-chat-panel${fullscreen ? " project-chat-panel--full" : ""}`}
              role="dialog"
              aria-label={isEn ? "INFA-TRACK project chat" : "INFA-TRACK chat ng proyekto"}
            >
              <div className="project-chat-sheet-handle" aria-hidden="true" />
              <header className="project-chat-header">
                <div>
                  <div className="project-chat-title">{isEn ? "INFA-TRACK Help" : "Tulong sa INFA-TRACK"}</div>
                  <div className="project-chat-sub">Project-only · Llama 3.2 1B (Ollama)</div>
                </div>
                <div className="project-chat-header-actions">
                  <button
                    type="button"
                    className="project-chat-icon-btn"
                    onClick={() => setFullscreen((v) => !v)}
                    title={fullscreen ? (isEn ? "Exit fullscreen" : "Iwan ang fullscreen") : (isEn ? "Fullscreen" : "Buong Screen")}
                    aria-label={fullscreen ? (isEn ? "Exit fullscreen" : "Iwan ang fullscreen") : (isEn ? "Enter fullscreen" : "Pumasok sa buong screen")}
                  >
                    {fullscreen ? (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    ) : (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="project-chat-icon-btn"
                    onClick={closePanel}
                    title={isEn ? "Close" : "Isara"}
                    aria-label={isEn ? "Close chat" : "Isara ang chat"}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="project-chat-messages" ref={listRef}>
                {messages.length === 0 && (
                  <div className="project-chat-empty">
                    {isEn
                      ? "Ask about INFA-TRACK (Planning, map layers, Edit Mode, roles, ports…). Off-topic questions are declined."
                      : "Magtanong tungkol sa INFA-TRACK (Pagpaplano, mga layer ng mapa, Edit Mode, tungkulin...). Ang mga tanong na malayo sa paksa ay hindi sasagutin."}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`project-chat-bubble project-chat-bubble--${m.role}`}
                  >
                    {m.content}
                  </div>
                ))}
                {busy && (
                  <div className="project-chat-bubble project-chat-bubble--assistant project-chat-typing">
                    {isEn ? "Thinking…" : "Nag-iisip…"}
                  </div>
                )}
              </div>

              {error && <div className="project-chat-error">{error}</div>}

              <div className="project-chat-compose">
                <textarea
                  ref={inputRef}
                  className="project-chat-input"
                  rows={fullscreen ? 3 : 2}
                  placeholder={isEn ? "Ask about this project…" : "Magtanong tungkol sa proyektong ito…"}
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <button
                  type="button"
                  className="project-chat-send"
                  disabled={busy || !input.trim()}
                  onClick={() => void send()}
                >
                  {isEn ? "Send" : "Ipadala"}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
