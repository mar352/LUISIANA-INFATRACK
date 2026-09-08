import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(
  /\/$/,
  "",
);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const MAX_HISTORY = 6;

const SYSTEM =
  "You answer questions about the INFA-TRACK Luisiana app (Municipality of Luisiana, Laguna, Philippines). Use only the Facts block. Reply in 2-5 short sentences. Never repeat rules. Never use [placeholders].";

function loadKnowledge() {
  const kbPath = path.join(__dirname, "data", "project-knowledge.md");
  try {
    return fs.readFileSync(kbPath, "utf8");
  } catch (err) {
    console.warn("[Chat] Could not load project-knowledge.md:", err.message);
    return "INFA-TRACK is a GIS app for Luisiana, Laguna, Philippines.";
  }
}

/** Condensed facts so small models stay on topic. */
function factsBlock() {
  const kb = loadKnowledge().slice(0, 3500);
  return `Facts:
- Place: Luisiana, Laguna, Philippines (map ~14.19N, 121.51E).
- App: INFA-TRACK / IMPACT-Luisiana — GIS infrastructure + disaster monitoring.
- Ports: UI 5173 (dev), 8080 (Docker), API 4000.
- Roles: MPDC, Engineer, Agriculture, Treasury Office, Viewer.
- Features: map layers, Planning board, Edit Mode street glow, Snap to Road, GLB projects.
- Docs excerpt:\n${kb}`;
}

function looksLikePromptLeak(text) {
  const t = text.toLowerCase();
  return (
    /hard rules|hawk rules|project knowledge|never use placeholder|\[city\/town\]|\[city_name\]|\[low_temperature\]|end knowledge|answer only from/i.test(
      t,
    ) || (t.includes("revised version") && t.includes("rules"))
  );
}

function isOffTopic(text) {
  // Keep broad LGU/app questions; only flag clear unrelated topics.
  return /\b(recipe|bitcoin|stock market|write a poem|homework math)\b/i.test(text);
}

function deterministicReply(userText) {
  if (isOffTopic(userText)) {
    return "I only answer questions about the INFA-TRACK Luisiana app for Luisiana, Laguna, Philippines.";
  }
  return null;
}

function wrapLastUser(messages) {
  const out = messages.map((m) => ({ ...m }));
  const lastIdx = [...out].map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0).pop();
  if (lastIdx == null) return out;
  const q = out[lastIdx].content;
  out[lastIdx] = {
    role: "user",
    content: `${factsBlock()}\n\nQuestion: ${q}\n\nAnswer briefly for Luisiana, Laguna:`,
  };
  return out;
}

/**
 * @param {{ role: string, content: string }[]} messages
 * @returns {Promise<{ reply: string, model?: string }>}
 */
export async function chatWithOllama(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error("messages array is required");
    err.status = 400;
    throw err;
  }

  const cleaned = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
    .slice(-MAX_HISTORY);

  if (!cleaned.some((m) => m.role === "user")) {
    const err = new Error("At least one user message is required");
    err.status = 400;
    throw err;
  }

  const lastUser = [...cleaned].reverse().find((m) => m.role === "user")?.content || "";

  // Small models often ignore system prompts — answer off-topic without LLM.
  const direct = deterministicReply(lastUser);
  if (direct) {
    return { reply: direct, model: "rules+live-data" };
  }

  const payload = {
    model: OLLAMA_MODEL,
    stream: false,
    options: {
      temperature: 0.1,
      top_p: 0.7,
      num_predict: 180,
    },
    messages: [{ role: "system", content: SYSTEM }, ...wrapLastUser(cleaned)],
  };

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const e = new Error(
      `Cannot reach Ollama. Start Ollama and run: ollama pull ${OLLAMA_MODEL}`,
    );
    e.status = 503;
    e.cause = err;
    throw e;
  }

  if (!res.ok) {
    let detail = `Ollama HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    const e = new Error(
      res.status === 404 ? `Model not found. Run: ollama pull ${OLLAMA_MODEL}` : detail,
    );
    e.status = res.status === 404 ? 503 : 502;
    throw e;
  }

  const data = await res.json();
  let reply = data?.message?.content?.trim() || "";
  if (!reply) {
    const e = new Error("Empty reply from Ollama");
    e.status = 502;
    throw e;
  }

  if (looksLikePromptLeak(reply) || /\[[a-z_]+\]/i.test(reply)) {
    reply =
      "INFA-TRACK covers the Municipality of Luisiana, Laguna, Philippines. Ask about Planning, Edit Mode, map layers, roles, or ports.";
  }

  return { reply, model: OLLAMA_MODEL };
}

export function getChatConfig() {
  return { baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL };
}
