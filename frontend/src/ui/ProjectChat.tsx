import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { backendUrl } from "../lib/api";
import "./ProjectChat.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function ProjectChat() {
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
    if (!open || !fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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
    <div className="project-chat-root">
      {!open && (
        <button
          type="button"
          className="project-chat-fab"
          onClick={() => setOpen(true)}
          title="INFA-TRACK help chat"
          aria-label="Open project help chat"
        >
          Help
        </button>
      )}

      {open && (
        <div
          className={`project-chat-panel${fullscreen ? " project-chat-panel--full" : ""}`}
          role="dialog"
          aria-label="INFA-TRACK project chat"
        >
          <header className="project-chat-header">
            <div>
              <div className="project-chat-title">INFA-TRACK Help</div>
              <div className="project-chat-sub">Project-only · Llama 3.2 1B (Ollama)</div>
            </div>
            <div className="project-chat-header-actions">
              <button
                type="button"
                className="project-chat-icon-btn"
                onClick={() => setFullscreen((v) => !v)}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {fullscreen ? "↙" : "↗"}
              </button>
              <button
                type="button"
                className="project-chat-icon-btn"
                onClick={closePanel}
                title="Close"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </header>

          <div className="project-chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="project-chat-empty">
                Ask about INFA-TRACK (Planning, map layers, Edit Mode, roles, ports…).
                Off-topic questions are declined.
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
                Thinking…
              </div>
            )}
          </div>

          {error && <div className="project-chat-error">{error}</div>}

          <div className="project-chat-compose">
            <textarea
              ref={inputRef}
              className="project-chat-input"
              rows={fullscreen ? 3 : 2}
              placeholder="Ask about this project…"
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
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
