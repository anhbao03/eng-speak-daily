// Text-to-speech and speech recognition. Browser APIs are only touched inside functions,
// so this module imports cleanly in Node for tests.

const URL_MSG = "Use an https:// address (for example via Tailscale). The browser blocks http:// from this app.";

export function voiceStudioUrlError(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return null;
    if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return null;
  } catch {}
  return URL_MSG;
}

// macOS ships novelty voices tagged en-US ("Bubbles", "Zarvox"…); prefer known natural ones.
const PREFERRED = ["Samantha", "Daniel", "Karen", "Moira", "Google US English", "Google UK English Female"];

export function englishVoices() {
  const pick = () => speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
  if (pick().length) return Promise.resolve(pick());
  return new Promise(resolve => {
    const done = () => resolve(pick());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 2000);
  });
}

function defaultVoice(voices) {
  for (const name of PREFERRED) {
    const v = voices.find(v => v.name.startsWith(name));
    if (v) return v;
  }
  return voices.find(v => /^en[-_](US|GB)/.test(v.lang));
}

let currentAudio = null;

function stopSpeaking() {
  if (globalThis.speechSynthesis) speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

async function speakVoiceStudio(text, rate, url, key) {
  const res = await fetch(`${url.replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: "tts-1", input: text, voice: "alloy", speed: rate }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`VoiceStudio ${res.status}`);
  const audio = new Audio(URL.createObjectURL(await res.blob()));
  currentAudio = audio;
  await new Promise((resolve, reject) => {
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);
  });
}

async function speakBrowser(text, rate, voiceName) {
  const voices = await englishVoices();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  u.voice = voices.find(v => v.name === voiceName) ?? defaultVoice(voices) ?? null;
  await new Promise(resolve => {
    u.onend = resolve;
    u.onerror = resolve; // "interrupted" when a newer speak() cancels this one
    speechSynthesis.speak(u);
  });
}

export async function speak(text, { rate = 1.0, voiceName, voiceStudioUrl, voiceStudioKey } = {}) {
  stopSpeaking();
  if (voiceStudioUrl && !voiceStudioUrlError(voiceStudioUrl)) {
    try { return await speakVoiceStudio(text, rate, voiceStudioUrl, voiceStudioKey); } catch {}
  }
  return speakBrowser(text, rate, voiceName);
}

const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export function canListen() {
  return !!Recognition();
}

let active = null;

export function listen() {
  const SR = Recognition();
  if (!SR) return Promise.reject(Object.assign(new Error("not-supported"), { code: "not-supported" }));
  if (active) active.abort();
  stopSpeaking();
  const r = new SR();
  active = r;
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  return new Promise((resolve, reject) => {
    let text = "";
    const fail = code => reject(Object.assign(new Error(code), { code }));
    r.onresult = e => { text = e.results[0][0].transcript.trim(); };
    r.onerror = e => fail(e.error);
    r.onend = () => {
      if (active === r) active = null;
      text ? resolve(text) : fail("no-speech");
    };
    r.start();
  });
}

export async function recordClip() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  rec.start();
  return {
    stop: () => new Promise(resolve => {
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        resolve(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.stop();
    }),
  };
}
