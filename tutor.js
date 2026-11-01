// Claude calls: daily lesson generation and conversation turns.
// The SDK is imported lazily so this module (and its pure helpers) load in Node tests.

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.135.0/+esm";
const MODEL = "claude-opus-5-5";

const SYSTEM = "You are a friendly English tutor for an adult learner at CEFR level A2–B1. Use short, simple, natural sentences and common everyday words. Never use idioms or rare words unless you explain them.";

export const TOPICS = ["your morning routine", "food you like", "your hometown", "weekend plans",
  "shopping", "the weather", "your job or studies", "a good friend", "travel", "hobbies",
  "your home", "health and exercise", "music and films", "transport in your city",
  "a holiday you remember", "cooking", "using your phone", "family", "animals", "learning English"];

export function topicFor(date) {
  const [y, m, d] = date.split("-").map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
  return TOPICS[((day % TOPICS.length) + TOPICS.length) % TOPICS.length];
}

export class TutorError extends Error {
  constructor(kind, message = kind) {
    super(message);
    this.kind = kind; // "auth" | "retry" | "refusal" | "truncated" | "bad_json"
  }
}

export function parseReply(message) {
  if (message.stop_reason === "refusal") throw new TutorError("refusal");
  if (message.stop_reason === "max_tokens") throw new TutorError("truncated");
  const text = message.content.find(b => b.type === "text")?.text;
  try { return JSON.parse(text); } catch { throw new TutorError("bad_json"); }
}

const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "story", "questions", "shadow"],
  properties: {
    title: { type: "string" },
    story: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "options", "answer"],
        properties: { q: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "integer" } },
      },
    },
    shadow: { type: "array", items: { type: "string" } },
  },
};

const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "has_correction", "wrong", "right", "why"],
  properties: {
    reply: { type: "string" },
    has_correction: { type: "boolean" },
    wrong: { type: "string" },
    right: { type: "string" },
    why: { type: "string" },
  },
};

let sdk = null;
const clients = new Map();

async function client(apiKey) {
  sdk ??= await import(SDK_URL);
  if (!clients.has(apiKey)) clients.set(apiKey, new sdk.Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
  return clients.get(apiKey);
}

// One structured-output request; retries once on truncated/malformed JSON.
async function ask(apiKey, { effort, schema, messages }, validate = () => true) {
  const c = await client(apiKey);
  for (let attempt = 0; ; attempt++) {
    try {
      const message = await c.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort, format: { type: "json_schema", schema } },
        messages,
      });
      const data = parseReply(message);
      if (!validate(data)) throw new TutorError("bad_json");
      return data;
    } catch (e) {
      if (e instanceof TutorError) {
        if (attempt === 0 && (e.kind === "truncated" || e.kind === "bad_json")) continue;
        throw e;
      }
      if (e instanceof sdk.AuthenticationError || e instanceof sdk.PermissionDeniedError) throw new TutorError("auth", e.message);
      if (e instanceof sdk.RateLimitError || e instanceof sdk.APIConnectionError || e instanceof sdk.InternalServerError) throw new TutorError("retry", e.message);
      throw e;
    }
  }
}

export function makeLesson({ apiKey, topic, recentMistakes = [] }) {
  const reuse = recentMistakes.slice(-5).map(m => m.right).join("; ") || "none";
  const content = `Write today's lesson about: ${topic}. Story: about 150 words, past or present simple, a few useful everyday phrases. 3 multiple-choice comprehension questions, 4 options each, answer = index of the correct option. 5 shadow sentences taken from the story, each 6–14 words. Try to reuse these words or structures the learner got wrong recently: ${reuse}.`;
  return ask(apiKey, { effort: "medium", schema: LESSON_SCHEMA, messages: [{ role: "user", content }] },
    l => l.questions.length === 3 && l.questions.every(q => q.options.length === 4) && l.shadow.length === 5);
}

export async function chatTurn({ apiKey, topic, history, said }) {
  const content = `Topic: ${topic}. The learner said (speech-to-text, ignore punctuation and capitalisation): "${said}"\nReply in 1–2 short sentences and ask one simple follow-up question. If there is a clear grammar or word-choice mistake, give exactly one correction; otherwise has_correction is false.`;
  const t = await ask(apiKey, { effort: "low", schema: TURN_SCHEMA, messages: [...history, { role: "user", content }] });
  return { reply: t.reply, correction: t.has_correction ? { wrong: t.wrong, right: t.right, why: t.why } : null };
}
