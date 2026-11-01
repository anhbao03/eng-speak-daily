import { score } from "./score.js";
import { createStore, localDate } from "./store.js";
import { speak, listen, canListen, recordClip, englishVoices, voiceStudioUrlError } from "./speech.js";
import { makeLesson, topicFor, TOPICS, TutorError } from "./tutor.js";

const store = createStore();
const today = localDate();
const $ = id => document.getElementById(id);

let settings = { rate: 0.8, voiceName: "", vsUrl: "", vsKey: "", ...store.get("settings", {}) };
let lesson = null;

export function show(screenId) {
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== screenId;
  window.scrollTo(0, 0);
}

function status(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", isError);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const say = (text, rate = settings.rate) =>
  speak(text, { rate, voiceName: settings.voiceName, voiceStudioUrl: settings.vsUrl, voiceStudioKey: settings.vsKey });

const errorText = e => {
  if (!(e instanceof TutorError)) return "Something went wrong. Try again.";
  return { auth: "Check your API key in Settings.", refusal: "Couldn't make that lesson — try again." }[e.kind]
    ?? "Couldn't reach Claude. Try again.";
};

document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) show(go.dataset.go);
});

// ---------- Home ----------

function renderHome() {
  const streak = store.get("streak", null);
  const yesterday = localDate(new Date(Date.now() - 86400000));
  $("streak").textContent = streak && [today, yesterday].includes(streak.lastDate) ? streak.count : 0;
  $("topic").textContent = store.get(`lesson:${today}`, null)?.topic ?? topicFor(today);
}

let topic = topicFor(today);

$("start").onclick = async () => {
  status("home-status", "");
  if (!store.get("apiKey", "")) {
    openSettings("Add your Claude API key to start.");
    return;
  }
  lesson = store.get(`lesson:${today}`, null);
  if (!lesson && !navigator.onLine) {
    const last = store.get("lastLessonDate", null);
    lesson = last && store.get(`lesson:${last}`, null);
    if (!lesson) return status("home-status", "You're offline and there's no saved lesson yet.", true);
    status("home-status", "Offline: replaying your last lesson.");
  }
  if (!lesson) {
    $("start").disabled = true;
    status("home-status", "Writing today's lesson…");
    try {
      const recentMistakes = store.get("mistakes", []).slice(-5);
      lesson = { ...(await makeLesson({ apiKey: store.get("apiKey", ""), topic, recentMistakes })), topic };
      store.set(`lesson:${today}`, lesson);
      store.set("lastLessonDate", today);
      status("home-status", "");
    } catch (e) {
      if (e instanceof TutorError && e.kind === "auth") return openSettings(errorText(e));
      if (e instanceof TutorError && e.kind === "refusal") topic = TOPICS[(TOPICS.indexOf(topic) + 1) % TOPICS.length];
      status("home-status", errorText(e), true);
      $("start").textContent = "Try again";
      return;
    } finally {
      $("start").disabled = false;
    }
  }
  renderListen();
  show("listen");
};

// ---------- Settings ----------

async function openSettings(message = "") {
  status("settings-status", message, !!message);
  $("api-key").value = store.get("apiKey", "");
  $("rate").value = String(settings.rate);
  $("vs-url").value = settings.vsUrl;
  $("vs-key").value = settings.vsKey;
  $("vs-url").oninput();
  $("ios-voices").hidden = !/iPhone|iPad/.test(navigator.userAgent);
  show("settings");
  const voices = await englishVoices();
  $("voice").replaceChildren(
    el("option", { value: "", textContent: "Automatic" }),
    ...voices.map(v => el("option", { value: v.name, textContent: `${v.name} (${v.lang})` })),
  );
  $("voice").value = settings.voiceName;
}

$("vs-url").oninput = () => {
  const err = voiceStudioUrlError($("vs-url").value.trim());
  $("vs-url-error").textContent = err ?? "";
  $("save-settings").disabled = !!err;
};

$("save-settings").onclick = () => {
  store.set("apiKey", $("api-key").value.trim());
  settings = {
    rate: Number($("rate").value),
    voiceName: $("voice").value,
    vsUrl: $("vs-url").value.trim(),
    vsKey: $("vs-key").value.trim(),
  };
  store.set("settings", settings);
  renderHome();
  show("home");
};

$("open-settings").onclick = () => openSettings();
$("close-settings").onclick = () => { renderHome(); show("home"); };

// ---------- Listen ----------

const sentences = text => text.trim().split(/(?<=[.!?])\s+/);

function renderRateToggle() {
  $("rate-toggle").textContent = settings.rate < 1 ? "Speed: slow" : "Speed: normal";
}

$("rate-toggle").onclick = () => {
  settings.rate = settings.rate < 1 ? 1 : 0.8;
  store.set("settings", settings);
  renderRateToggle();
};

$("play-story").onclick = () => say(lesson.story);

function renderListen() {
  $("lesson-title").textContent = lesson.title;
  renderRateToggle();
  $("story").replaceChildren(...sentences(lesson.story).map(s =>
    el("button", { className: "sentence", textContent: s, onclick: () => say(s) })));
  $("questions").replaceChildren(...lesson.questions.map((q, qi) => {
    const buttons = q.options.map((opt, oi) => el("button", {
      textContent: opt,
      onclick: () => {
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (i === q.answer) b.classList.add("right");
        });
        if (oi !== q.answer) buttons[oi].classList.add("wrong");
        buttons[oi].classList.add("chosen");
      },
    }));
    return el("div", { className: "card" }, el("p", { textContent: `${qi + 1}. ${q.q}` }), el("div", { className: "row" }, ...buttons));
  }));
  shadowIndex = 0;
}

// ---------- Shadow ----------

let shadowIndex = 0;
let listenFails = 0;
let recording = null;
let myClip = null;

function shadowScores() {
  const all = store.get("shadowScores", {});
  all[today] ??= [0, 0, 0, 0, 0];
  return all;
}

function useFallback() {
  return listenFails >= 2 || !canListen();
}

function renderShadow() {
  const target = lesson.shadow[shadowIndex];
  $("shadow-pos").textContent = `${shadowIndex + 1} / ${lesson.shadow.length}`;
  $("shadow-target").textContent = target;
  $("shadow-result").replaceChildren();
  $("shadow-score").textContent = "";
  $("shadow-input").value = "";
  status("shadow-status", "");
  const fallback = useFallback();
  $("shadow-say").hidden = !canListen();
  $("shadow-record").hidden = !fallback;
  $("shadow-type").hidden = !fallback;
  $("shadow-mine").hidden = !myClip;
  $("shadow-prev").disabled = shadowIndex === 0;
  $("shadow-next").textContent = shadowIndex === lesson.shadow.length - 1 ? "Next: Talk →" : "Next →";
}

function showScore(said) {
  const result = score(lesson.shadow[shadowIndex], said);
  $("shadow-score").textContent = `${result.percent}%`;
  $("shadow-result").replaceChildren(...result.words.flatMap(w => [el("span", { className: w.status, textContent: w.word }), " "]));
  if (result.extra.length) $("shadow-result").append(el("p", { className: "muted", textContent: `Extra words: ${result.extra.join(" ")}` }));
  const all = shadowScores();
  all[today][shadowIndex] = Math.max(all[today][shadowIndex], result.percent);
  store.set("shadowScores", all);
}

$("shadow-play").onclick = () => say(lesson.shadow[shadowIndex]);

$("shadow-say").onclick = async () => {
  $("shadow-say").disabled = true;
  status("shadow-status", "Listening… say the sentence.");
  try {
    const said = await listen();
    listenFails = 0;
    status("shadow-status", `You said: “${said}”`);
    showScore(said);
  } catch (e) {
    listenFails++;
    status("shadow-status", e.code === "no-speech" ? "I didn't hear anything — try again." : "Couldn't use the microphone — try again.", true);
    if (useFallback()) {
      renderShadow();
      status("shadow-status", "You can record yourself and type what you said.");
    }
  } finally {
    $("shadow-say").disabled = false;
  }
};

$("shadow-record").onclick = async () => {
  if (recording) {
    myClip = await recording.stop();
    recording = null;
    $("shadow-record").textContent = "⏺ Record";
    $("shadow-mine").hidden = false;
    return;
  }
  try {
    recording = await recordClip();
    myClip = null;
    $("shadow-record").textContent = "⏹ Stop";
  } catch {
    status("shadow-status", "Couldn't use the microphone.", true);
  }
};

$("shadow-mine").onclick = () => myClip && new Audio(URL.createObjectURL(myClip)).play();

$("shadow-check").onclick = () => {
  const said = $("shadow-input").value.trim();
  if (said) showScore(said);
};

$("shadow-prev").onclick = () => { shadowIndex--; myClip = null; renderShadow(); };
$("shadow-next").onclick = () => {
  myClip = null;
  if (shadowIndex === lesson.shadow.length - 1) return show("talk");
  shadowIndex++;
  renderShadow();
};

document.querySelector('[data-go="shadow"]').addEventListener("click", renderShadow);

renderHome();
