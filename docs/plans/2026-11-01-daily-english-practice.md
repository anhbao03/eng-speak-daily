# Daily English Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first installable web app for a daily 15-minute Listen → Shadow → Talk → Review English session at A2–B1.

**Architecture:** Plain static files (ES modules, no build, no framework) hosted on GitHub Pages. Browser speech APIs for TTS/STT, Claude Opus 5.5 called directly from the browser with the user's key, everything persisted in `localStorage`. Pure logic (`score.js`, `store.js`, parsing in `tutor.js`) is DOM-free and tested with plain `node` asserts.

**Tech Stack:** HTML/CSS/JS (ES modules), Web Speech API, MediaRecorder, `@anthropic-ai/sdk` via jsDelivr ESM, Service Worker, Node ≥18 for tests.

**Spec:** `docs/specs/2026-11-01-daily-english-practice-design.md`

## Global Constraints

- No build step, no framework, no npm dependencies in the app. Tests use only `node:assert`.
- Every module is an ES module (`<script type="module">`, `export`/`import`).
- Modules imported by tests (`score.js`, `store.js`, `tutor.js`) must not touch `window`/`document` at import time.
- Model: `claude-opus-5-5`. Effort: `low` for chat turns, `medium` for lesson generation. Thinking: omit (adaptive by default). `max_tokens: 16000`.
- SDK: `https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@<EXACT>/+esm` with an exact version published at least 2 weeks before implementation (check with `npm view @anthropic-ai/sdk time --json`). Client: `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
- Lesson: story ~150 words at A2–B1; exactly 3 questions with 4 options each; exactly 5 shadow sentences.
- Chat: reply is 1–2 simple sentences; at most one correction per turn.
- Playback rates: `0.8` and `1.0` only.
- After 2 failed recognitions in a row, show the "Type it" input.
- `mistakes` keeps the last 200 entries.
- Dates are **local** `YYYY-MM-DD`, never `toISOString()` (user is UTC+7; UTC dates break the streak after 17:00 local).
- VoiceStudio is optional; any failure falls back silently to browser voices.
- Hosting is HTTPS (microphone requires a secure context). Creating the GitHub repo and pushing are outward-facing: ask the user before doing either.

## Review Focus

1. **Silence or empty transcript** — `score(target, "")` returns `percent: 0` (not `NaN`), every word `missed`; Talk never sends an empty turn to Claude. Tests in Task 2 and Task 6.
2. **Digits vs words** — recognition returns "I have 2 cats" for "I have two cats"; must score 100. Test in Task 2.
3. **Late-night practice across UTC midnight** — a session at 23:30 local counts for that local day. Test in Task 3.
4. **Truncated or malformed model JSON** — retried once, then a readable error, never a crash. Test in Task 5.
5. **`localStorage` blocked or full** (private mode, quota) — app keeps working in memory for the session. Test in Task 3.
6. **VoiceStudio over plain `http://` from the HTTPS app** — the browser blocks it as mixed content; settings must reject `http://` URLs other than `localhost`/`127.0.0.1` with a message, not fail silently forever. Test in Task 4.

---

### Task 1: Repo, hosting and speech spike (throwaway)

Decides whether "record + type" is the fallback or the main path on iPhone.

**Files:**
- Create: `spike.html`, `README.md`

**Interfaces:**
- Produces: a public HTTPS URL `https://<user>.github.io/<repo>/` used for every later device test.

- [ ] **Step 1:** `git init`, add `README.md` (one paragraph: what the app is, `python3 -m http.server 8000` to run locally, `node score.test.js && node store.test.js && node tutor.test.js` to test).
- [ ] **Step 2:** Write `spike.html`: a text box (default "Hello, how are you today?"), **Speak** button (`speechSynthesis.speak`, `lang en-US`), **Listen** button (`SpeechRecognition || webkitSpeechRecognition`, `lang en-US`, `interimResults false`), and a log area printing: feature support booleans, list of `en-*` voices, the transcript or the `error` event's `.error` code, and `navigator.standalone` / `matchMedia('(display-mode: standalone)').matches`.
- [ ] **Step 3:** Ask the user for permission, then create the GitHub repo (public — free Pages requires it; no secrets are in the repo), push, enable Pages on `main` / root.
- [ ] **Step 4:** User opens `spike.html` on: iPhone Safari, iPhone home-screen (Share → Add to Home Screen), Android Chrome. Record the results for each in `README.md` under "Device notes".
- [ ] **Step 5:** Commit: `git commit -m "chore: speech spike and device notes"`.

If iPhone home-screen Listen fails: Task 7's iPhone default becomes record + type, and the README says to use Safari instead of the home-screen app for live recognition.

---

### Task 2: score.js

**Files:**
- Create: `score.js`, `score.test.js`

**Interfaces:**
- Produces:
  - `normalize(text: string) -> string[]` — lowercase tokens, punctuation stripped, contractions expanded, digits 0–20 converted to words.
  - `score(target: string, said: string) -> { percent: number, words: {word: string, status: "ok"|"missed"}[], extra: string[] }` — `words` are the normalized target tokens; `percent` is an integer 0–100.

- [ ] **Step 1: Write the failing tests** in `score.test.js` (`import assert from "node:assert/strict"`):

```js
assert.equal(score("I like green tea.", "i like green tea").percent, 100);
const m = score("I like green tea", "I like tea");
assert.equal(m.percent, 75);
assert.deepEqual(m.words.find(w => w.word === "green").status, "missed");
assert.deepEqual(score("I like tea", "I really like tea").extra, ["really"]);
assert.equal(score("I'm fine, thanks!", "I am fine thanks").percent, 100);
assert.equal(score("I don't know", "I do not know").percent, 100);
assert.equal(score("I have two cats", "I have 2 cats").percent, 100);
const e = score("Good morning", "");
assert.equal(e.percent, 0);
assert.ok(e.words.every(w => w.status === "missed"));
assert.equal(score("", "anything").percent, 0);
console.log("score ok");
```

- [ ] **Step 2:** Run `node score.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `normalize` and `score` in `score.js`. Contractions map (apply after lowercasing, `’` treated as `'`): `i'm→i am, you're→you are, we're→we are, they're→they are, it's→it is, that's→that is, there's→there is, he's→he is, she's→she is, i've→i have, you've→you have, we've→we have, i'll→i will, you'll→you will, i'd→i would, don't→do not, doesn't→does not, didn't→did not, isn't→is not, aren't→are not, wasn't→was not, can't→can not, cannot→can not, won't→will not, let's→let us`. Digits `0`–`20` → `zero`…`twenty`. Alignment: word-level LCS over normalized tokens; target tokens on the LCS path are `ok`, the rest `missed`; said tokens off the path go to `extra`. Empty target → `percent 0`.
- [ ] **Step 4:** Run `node score.test.js`. Expected: `score ok`.
- [ ] **Step 5:** Commit: `git commit -m "feat: word-level shadowing score"`.

---

### Task 3: store.js (storage, streak, mistakes)

**Files:**
- Create: `store.js`, `store.test.js`

**Interfaces:**
- Produces:
  - `localDate(d: Date = new Date()) -> string` — local `YYYY-MM-DD`.
  - `createStore(storage = globalThis.localStorage) -> { get(key: string, fallback: any): any, set(key: string, value: any): void }` — JSON values; if `storage` is missing or any call throws, uses an in-memory `Map` for the rest of the session.
  - `updateStreak(streak: {count: number, lastDate: string} | null, today: string) -> {count, lastDate}` — same day: unchanged; day after `lastDate`: `count + 1`; otherwise `1`.
  - `addMistakes(list: Mistake[], fresh: Mistake[]) -> Mistake[]` — appends, keeps last 200. `Mistake = {date: string, wrong: string, right: string, why: string}`.
  - Keys used app-wide: `apiKey`, `settings`, `lesson:<date>`, `streak`, `mistakes`, `shadowScores` (`{[date]: number[5]}`), `talkLog:<date>`.

- [ ] **Step 1: Write the failing tests** in `store.test.js`:

```js
assert.equal(localDate(new Date(2026, 10, 1, 23, 30)), "2026-11-01");
assert.equal(localDate(new Date(2026, 0, 5, 0, 10)), "2026-01-05");
assert.deepEqual(updateStreak(null, "2026-11-01"), { count: 1, lastDate: "2026-11-01" });
assert.deepEqual(updateStreak({ count: 3, lastDate: "2026-11-01" }, "2026-11-01"), { count: 3, lastDate: "2026-11-01" });
assert.deepEqual(updateStreak({ count: 3, lastDate: "2026-10-31" }, "2026-11-01"), { count: 4, lastDate: "2026-11-01" });
assert.deepEqual(updateStreak({ count: 3, lastDate: "2026-12-31" }, "2027-01-01"), { count: 4, lastDate: "2027-01-01" });
assert.deepEqual(updateStreak({ count: 3, lastDate: "2026-10-29" }, "2026-11-01"), { count: 1, lastDate: "2026-11-01" });
const many = Array.from({ length: 250 }, (_, i) => ({ date: "d", wrong: String(i), right: "", why: "" }));
assert.equal(addMistakes([], many).length, 200);
assert.equal(addMistakes([], many)[199].wrong, "249");
const mem = new Map();
const ok = createStore({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
ok.set("a", { x: 1 }); assert.deepEqual(ok.get("a", null), { x: 1 });
const broken = createStore({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } });
broken.set("b", 2); assert.equal(broken.get("b", 0), 2);
assert.equal(createStore(undefined).get("missing", "fb"), "fb");
console.log("store ok");
```

- [ ] **Step 2:** Run `node store.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement in `store.js`. Day arithmetic: parse `YYYY-MM-DD` to a local `Date(y, m-1, d)`, add one day, compare with `localDate`.
- [ ] **Step 4:** Run `node store.test.js`. Expected: `store ok`.
- [ ] **Step 5:** Commit: `git commit -m "feat: local storage, streak and mistakes"`.

---

### Task 4: speech.js

Browser-only; verified manually. One pure helper is unit-tested.

**Files:**
- Create: `speech.js`, `speech.test.js`

**Interfaces:**
- Produces:
  - `voiceStudioUrlError(url: string) -> string | null` — `null` when empty or `https://…`, or `http://localhost…` / `http://127.0.0.1…`; otherwise the message `"Use an https:// address (for example via Tailscale). The browser blocks http:// from this app."`.
  - `englishVoices() -> Promise<SpeechSynthesisVoice[]>` — voices whose `lang` starts with `en`; waits for `voiceschanged` (max 2 s).
  - `speak(text: string, {rate = 1.0, voiceName, voiceStudioUrl, voiceStudioKey} = {}) -> Promise<void>` — cancels any current speech first. If `voiceStudioUrl` is set and valid: `POST {url}/v1/audio/speech` with JSON `{model: "tts-1", input: text, voice: "alloy", speed: rate}`, header `Authorization: Bearer <key>` when a key is set, `AbortSignal.timeout(8000)`; plays the returned audio via `new Audio(URL.createObjectURL(blob))`. Any failure → `speechSynthesis` with the named voice (or first `en-US`/`en-GB`), `lang "en-US"`, given rate. Resolves when playback ends.
  - `canListen() -> boolean`.
  - `listen() -> Promise<string>` — one utterance, `lang "en-US"`, final transcript trimmed. Aborts any recognition already running. Rejects with `Error` whose `.code` is the recognition error code, or `"no-speech"` when the result is empty, or `"not-supported"`.
  - `recordClip() -> Promise<{stop: () => Promise<Blob>}>` — `getUserMedia({audio: true})` + `MediaRecorder`; `stop` releases the mic tracks.

- [ ] **Step 1: Write the failing test** `speech.test.js` for `voiceStudioUrlError`: `""`→`null`, `"https://mac.tail1234.ts.net"`→`null`, `"http://localhost:3900"`→`null`, `"http://127.0.0.1:3900"`→`null`, `"http://192.168.1.5:3900"`→ the message above. `speech.js` must import cleanly in Node (no top-level `window` access). End the file with `console.log("speech ok")`.
- [ ] **Step 2:** Run `node speech.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `speech.js` per the interfaces.
- [ ] **Step 4:** Run `node speech.test.js`. Expected: `speech ok`. Then replace `spike.html`'s inline code with imports from `speech.js` and check Speak/Listen still work on desktop Chrome at `http://localhost:8000/spike.html`.
- [ ] **Step 5:** Commit: `git commit -m "feat: speech helpers with VoiceStudio fallback"`.

---

### Task 5: tutor.js (Claude calls)

**Files:**
- Create: `tutor.js`, `tutor.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `TOPICS: string[]` and `topicFor(date: string) -> string` — deterministic by day number (days since 2026-01-01 mod length).
  - `class TutorError extends Error { kind: "auth" | "retry" | "refusal" | "truncated" | "bad_json" }`.
  - `parseReply(message) -> object` — throws `TutorError("refusal")` when `stop_reason === "refusal"`, `"truncated"` when `"max_tokens"`, `"bad_json"` when the first `text` block isn't valid JSON; otherwise returns the parsed object.
  - `makeLesson({apiKey, topic, recentMistakes: Mistake[]}) -> Promise<Lesson>` where `Lesson = {title: string, story: string, questions: {q: string, options: string[4], answer: number}[3], shadow: string[5]}`.
  - `chatTurn({apiKey, topic, history: {role: "user"|"assistant", content: string}[], said: string}) -> Promise<{reply: string, correction: {wrong, right, why} | null}>`.
  - The SDK is loaded lazily inside these two functions with `await import(SDK_URL)`, so the module imports in Node.

- [ ] **Step 1: Write the failing tests** `tutor.test.js` (no network):

```js
const msg = (text, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text }] });
assert.deepEqual(parseReply(msg('{"a":1}')), { a: 1 });
assert.throws(() => parseReply(msg("", "refusal")), e => e.kind === "refusal");
assert.throws(() => parseReply(msg('{"a":', "max_tokens")), e => e.kind === "truncated");
assert.throws(() => parseReply(msg("not json")), e => e.kind === "bad_json");
assert.equal(topicFor("2026-11-01"), topicFor("2026-11-01"));
assert.notEqual(topicFor("2026-11-01"), topicFor("2026-11-02"));
console.log("tutor ok");
```

- [ ] **Step 2:** Run `node tutor.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `tutor.js`.**
  - `TOPICS`: `["your morning routine", "food you like", "your hometown", "weekend plans", "shopping", "the weather", "your job or studies", "a good friend", "travel", "hobbies", "your home", "health and exercise", "music and films", "transport in your city", "a holiday you remember", "cooking", "using your phone", "family", "animals", "learning English"]`.
  - Both calls: `client.messages.create({model: "claude-opus-5-5", max_tokens: 16000, system: [{type: "text", text: SYSTEM, cache_control: {type: "ephemeral"}}], output_config: {effort, format: {type: "json_schema", schema}}, messages})`, then `parseReply`. On `truncated` or `bad_json`, retry once, then rethrow. Map SDK errors: `Anthropic.AuthenticationError`/`PermissionDeniedError` → `TutorError("auth")`; `RateLimitError`, `APIConnectionError`, `InternalServerError` → `TutorError("retry")` (the SDK already retries twice).
  - `SYSTEM` (exact copy): `"You are a friendly English tutor for an adult learner at CEFR level A2–B1. Use short, simple, natural sentences and common everyday words. Never use idioms or rare words unless you explain them."`
  - Lesson user message: `"Write today's lesson about: <topic>. Story: about 150 words, past or present simple, a few useful everyday phrases. 3 multiple-choice comprehension questions, 4 options each, answer = index of the correct option. 5 shadow sentences taken from the story, each 6–14 words. Try to reuse these words or structures the learner got wrong recently: <right forms of up to 5 recent mistakes, or 'none'>."` Effort `medium`.
  - Lesson schema: object, `additionalProperties: false`, required `title, story, questions, shadow`; `questions` items `{q: string, options: string[], answer: integer}`; `shadow: string[]`. After parsing, throw `TutorError("bad_json")` if `questions.length !== 3`, any `options.length !== 4`, or `shadow.length !== 5`.
  - Chat: `messages = [...history, {role: "user", content: `Topic: ${topic}. The learner said (speech-to-text, ignore punctuation and capitalisation): "${said}"`}]` plus a turn instruction in the same user message: `"Reply in 1–2 short sentences and ask one simple follow-up question. If there is a clear grammar or word-choice mistake, give exactly one correction; otherwise has_correction is false."` Effort `low`.
  - Chat schema: `{reply: string, has_correction: boolean, wrong: string, right: string, why: string}`, all required, `additionalProperties: false`. Return `correction: null` when `has_correction` is false.
- [ ] **Step 4:** Run `node tutor.test.js`. Expected: `tutor ok`. Then a manual smoke test in desktop Chrome console at `localhost:8000`: `(await import("./tutor.js")).makeLesson({apiKey: <user's key>, topic: "food you like", recentMistakes: []})` returns a valid `Lesson`. The user pastes the key into the console themselves.
- [ ] **Step 5:** Commit: `git commit -m "feat: Claude lesson and chat calls"`.

---

### Task 6: App shell, settings, Listen and Shadow

**Files:**
- Create: `index.html` (markup + `<style>`), `app.js`

**Interfaces:**
- Consumes: `score`, `createStore`, `localDate`, `speak`, `listen`, `canListen`, `recordClip`, `englishVoices`, `voiceStudioUrlError`, `makeLesson`, `topicFor`, `TutorError`.
- Produces: `show(screenId: string)` in `app.js`; screens `home`, `listen`, `shadow`, `talk`, `review`, `settings` as `<section id>` elements, one visible at a time.

- [ ] **Step 1: Home** shows the streak count, today's topic and a **Start** button. Start: if no `apiKey`, open Settings; if `lesson:<today>` exists use it; else `makeLesson` with the last 5 mistakes, with a loading state. On `TutorError`: `auth` → Settings with "Check your API key"; `retry`/`truncated`/`bad_json` → "Try again" button; `refusal` → "Couldn't make that lesson — try again", and the retry uses `TOPICS[(TOPICS.indexOf(topic) + 1) % TOPICS.length]`. Offline (`!navigator.onLine`) with no lesson for today → offer the most recent stored `lesson:*`.
- [ ] **Step 2: Settings**: API key (password input) with the text "Create a separate key with a low monthly spend limit in the Anthropic Console. It is stored only on this device."; voice picker from `englishVoices()`; default rate 0.8/1.0; VoiceStudio URL + optional key, with `voiceStudioUrlError` shown inline and Save disabled while it returns a message. On iPhone (`/iPhone|iPad/.test(navigator.userAgent)`) also show: "Better voices: Settings → Accessibility → Spoken Content → Voices → English."
- [ ] **Step 3: Listen**: title, **Play story** (whole story at the chosen rate), a 0.8×/1× toggle, the story split into sentences (`/(?<=[.!?])\s+/`) with each one tappable to replay it, then the 3 questions; tapping an option marks it right/wrong and reveals the answer. **Next** → Shadow.
- [ ] **Step 4: Shadow**: one sentence at a time with **Play**, **Say it**, and a result line rendering `score().words` (`ok` green, `missed` red underline) and the percent. Best percent per sentence saved to `shadowScores[today]`. Count consecutive `listen()` failures; after 2, or when `!canListen()`, show **Record** (via `recordClip`, then a **Play mine** button) and a "Type what you said" input that is scored with `score()`. `listen()` rejecting with `no-speech` shows "I didn't hear anything — try again". Never call `score` with a result from a failed listen.
- [ ] **Step 5:** Manual check at `localhost:8000` (desktop Chrome): full Listen → Shadow on a generated lesson; reload mid-way and today's lesson is reused, not regenerated.
- [ ] **Step 6:** Commit: `git commit -m "feat: home, settings, listen and shadow screens"`.

---

### Task 7: Talk

**Files:**
- Modify: `index.html` (talk section), `app.js`

**Interfaces:**
- Consumes: `chatTurn`, `addMistakes`, `listen`, `speak`, store key `talkLog:<date>` (array of `{role, content}`).

- [ ] **Step 1:** Talk screen: a 5:00 countdown starting at the first turn, a chat list, a large **Tap to speak** button (tap to start, recognition ends on silence), and a text input with **Send** (always visible on iPhone when Task 1 found home-screen recognition broken, and after 2 failed listens elsewhere).
- [ ] **Step 2:** On a transcript or typed text: trim; if empty, show "I didn't hear anything — try again" and do **not** call `chatTurn`. Otherwise call `chatTurn` with `talkLog:<today>` as history, append both turns to the log, `speak(reply)`, and when `correction` is not null render a card "<wrong> → <right> — <why>" and save it with `addMistakes` (date = today). Disable the speak/send controls while a turn is in flight.
- [ ] **Step 3:** First assistant turn: on entering Talk with an empty log, call `chatTurn` with `said: "(start the conversation with a simple question about the topic)"` and do not show that user turn in the list.
- [ ] **Step 4:** **Finish** (or timer reaching 0 after the current turn completes) → Review. Errors use the same `TutorError` mapping as Step 1 of Task 6.
- [ ] **Step 5:** Manual check: 3 exchanges by voice in desktop Chrome, one deliberate mistake ("Yesterday I go to the market") produces a correction card that appears in `mistakes`.
- [ ] **Step 6:** Commit: `git commit -m "feat: spoken AI conversation"`.

---

### Task 8: Review, streak and installable app

**Files:**
- Modify: `index.html`, `app.js`
- Create: `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`
- Delete: `spike.html`

- [ ] **Step 1: Review**: today's corrections from `mistakes`, shadow sentences with best score < 80 (each with a Play button), and the streak. Entering Review sets `streak = updateStreak(streak, localDate())` — reaching Review is a completed session.
- [ ] **Step 2: Manifest**: `name "Daily English"`, `short_name "English"`, `start_url "./"`, `scope "./"`, `display "standalone"`, `background_color`/`theme_color` matching the page, both icons. In `index.html`: `<link rel="manifest">`, `<link rel="apple-touch-icon" href="icon-192.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, viewport meta. Icons: a plain 512×512 and 192×192 PNG (any tool).
- [ ] **Step 3: `sw.js`**: on install, cache `./`, `index.html`, `app.js`, `score.js`, `store.js`, `speech.js`, `tutor.js`, `manifest.webmanifest`, icons under cache name `daily-english-v1`; on fetch, cache-first for those, network-only for everything else (SDK CDN, API calls, VoiceStudio — all need the network anyway). On activate, delete other cache names. Register from `app.js` when `"serviceWorker" in navigator`.
- [ ] **Step 4:** Manual check: in desktop Chrome DevTools → Application, the manifest is valid and installable; with Network set to Offline, a reload still opens Home and replays the stored lesson.
- [ ] **Step 5:** Commit: `git commit -m "feat: review, streak and offline install"`.

---

### Task 9: Deploy and device checklist

- [ ] **Step 1:** Run all tests: `node score.test.js && node store.test.js && node speech.test.js && node tutor.test.js`. Expected: four `ok` lines.
- [ ] **Step 2:** Ask the user, then push to `main`; wait for Pages to publish.
- [ ] **Step 3:** User runs this checklist on Android Chrome, iPhone Safari and the iPhone home-screen app, and the results go into `README.md` "Device notes":
  - Mic permission prompt appears once; Speak plays at 0.8× and 1×.
  - Say it works, or the record + type fallback appears after 2 misses.
  - A lesson generates; one Talk exchange with a correction works.
  - Review shows the correction; the streak is 1; next day it is 2.
  - Airplane mode: the app opens and replays the last lesson; Talk shows the offline message.
- [ ] **Step 4:** Commit: `git commit -m "docs: device test results"` and push (with the user's OK).
