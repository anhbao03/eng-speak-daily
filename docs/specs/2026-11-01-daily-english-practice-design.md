# Daily English Practice — design spec

Date: 2026-11-01 · Status: draft for review

## Goal

A phone-first web app for **15 minutes of English listening and speaking every
day**, aimed at general fluency (not exam prep), starting level **A2–B1**.

Success = the user opens it daily on Android or iPhone, anywhere, and completes
Listen → Shadow → Talk → Review without setup friction.

### Decided

- General fluency, not Aptis-format practice.
- Phone anywhere is the main environment; both Android and iPhone.
- Includes AI spoken conversation with grammar correction.
- Approach A: static installable web app (PWA), no backend.
- AI model: Claude Opus 5.5 (`claude-opus-5-5`), user's own API key.

### Assumed (correct if wrong)

- Single user, no accounts, progress stays on the device.
- ~US$5/month API spend is acceptable (~20 Claude turns/day).

### Out of scope (add when missed)

Login, cross-device sync, accent/phoneme scoring, Aptis mock tests, multiple
users, native apps.

## Relationship to VoiceStudio

VoiceStudio (`~/Desktop/voice-stuido/VoiceStudioRepo`) is a local speech server
on `:3900` with OpenAI-compatible TTS (`POST /v1/audio/speech`) and STT
(`POST /v1/audio/transcriptions`). It only runs where its backend runs, and its
iOS build is a 7-day sideload, so it is **not** a dependency.

It is an **optional setting**: when "VoiceStudio URL" is set and reachable,
`speak()` uses `/v1/audio/speech` for better voices; otherwise browser voices.
The app works fully without it. Because the app is served over HTTPS, the
VoiceStudio URL must also be `https://` (e.g. Tailscale) or `localhost`;
browsers block `http://` LAN addresses as mixed content. Settings has an
optional VoiceStudio API key, sent as a bearer token for remote backends.

## Daily session

1. **Listen** — Claude-written short story at A2–B1 (~150 words), read aloud at
   0.8× or 1×, replay per sentence; 3 comprehension questions (multiple
   choice), answers revealed after choosing.
2. **Shadow** — 5 sentences from the story. Hear one → speak it → word-by-word
   match: percent score, missed/swapped words highlighted. Retry allowed; best
   score kept.
3. **Talk** — ~5-minute spoken chat on the day's topic. Claude replies in 1–2
   simple sentences and gives at most one gentle correction per turn
   (`wrong → right`, short reason). Ends by timer or "Finish".
4. **Review** — today's corrections and lowest-scoring shadow sentences; streak
   counter (consecutive days with a completed session).

Next day's lesson prompt includes a few recent mistakes so they recur.

## Architecture

Plain static files, no build step, no framework. Hosted on GitHub Pages (HTTPS
is required for microphone access).

| File | Responsibility |
|---|---|
| `index.html` | Four screens + settings sheet |
| `app.js` | Screen flow and DOM wiring |
| `store.js` | Storage, streak, mistakes list (pure, tested) |
| `speech.js` | `speak(text, rate)`, `listen()` |
| `tutor.js` | Claude calls: `makeLesson(topic, recentMistakes)`, `chatTurn(history, said)` |
| `score.js` | `score(target, said)` → `{percent, words: [{word, status}]}` |
| `score.test.js` | Plain-assert test, run with `node score.test.js` |
| `manifest.webmanifest`, `sw.js`, `icon.png` | Installable PWA; app shell cached for offline |

### speech.js

- `speak(text, rate)`: VoiceStudio `/v1/audio/speech` if configured and
  reachable, else `speechSynthesis` with the chosen `en-*` voice (picker in
  settings; default = first `en-US`/`en-GB` local voice).
- `listen()`: `SpeechRecognition || webkitSpeechRecognition`, `lang: en-US`,
  resolves with the final transcript; rejects on no-speech/error.
- `canListen()`: feature check used to switch to the record + type fallback.

### tutor.js

- Official Anthropic TypeScript/JS SDK loaded as an ES module from a CDN, with
  pinned exact version, `dangerouslyAllowBrowser: true` (sends the
  browser direct-access header).
- Model `claude-opus-5-5`; adaptive thinking (default), `output_config.effort`
  `low` for chat turns, `medium` for lesson generation.
- Both calls use structured outputs (`output_config.format`, JSON schema):
  - `makeLesson` → `{title, story, questions: [{q, options[4], answer}], shadow: [5 sentences]}`
  - `chatTurn` → `{reply, correction: {wrong, right, why} | null}`
- Stable system prompt (level A2–B1, short simple sentences, max one
  correction) kept first for prompt caching.
- Check `stop_reason` before reading content (`refusal` → show short message,
  skip to next topic; `max_tokens` → retry once).

### score.js

Normalize both strings (lowercase, strip punctuation, expand common
contractions: "I'm" = "I am", "don't" = "do not", …), then word-level LCS
alignment. Status per target word: `ok` / `missed`; extra spoken words listed
separately. `percent = ok / targetWords`.

### Storage (`localStorage`, device-only)

`apiKey`, `settings` (rate, voice, VoiceStudio URL), `lesson:<YYYY-MM-DD>`,
`streak` (`{count, lastDate}`), `mistakes` (last 200), `shadowScores`.

## Error handling

| Case | Behaviour |
|---|---|
| No speech recognition (some iPhone contexts, Firefox) | Shadow/Talk switch to **record + type**: `MediaRecorder` records, user plays it back beside the model voice, types what they said for scoring/chat |
| Recognition no-speech / early stop | "Try again"; after 2 misses offer "type it" |
| No good English voice | Voice picker; on iPhone link to Settings → Accessibility → Spoken Content to download voices |
| Bad/missing API key (401) | Open settings with message |
| 429 / 5xx / network | SDK auto-retries; then "Try again" button |
| Offline | Replay the last cached lesson for Listen + Shadow; Talk disabled with message |
| VoiceStudio unreachable | Silently fall back to browser voices |

API key safety: stored only on the device; settings screen tells the user to
create a dedicated key with a low monthly spend limit in the Anthropic Console.

## Build order

1. **Speech spike** — one page with Speak/Listen buttons. Test on iPhone
   Safari, iPhone home-screen app, Android Chrome. Result decides whether
   record + type is a fallback or the main iPhone path. Throwaway.
2. `score.js` + `score.test.js`.
3. Listen + Shadow with a hardcoded lesson.
4. `tutor.js`: generated lessons, then Talk.
5. Review, streak, manifest + service worker.
6. Deploy to GitHub Pages; device checklist on both phones.

## Testing

- `node score.test.js`: exact match, missing word, extra word, punctuation and
  case, contractions.
- Manual device checklist (Android Chrome, iPhone Safari, iPhone home screen):
  speak works; listen works or fallback appears; mic permission prompt;
  lesson generates; one Talk exchange with a correction; streak increments
  next day; app opens offline.
