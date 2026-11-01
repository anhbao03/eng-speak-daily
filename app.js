import { score } from "./score.js";
import { createStore, localDate, addMistakes } from "./store.js";
import { speak, listen, canListen, recordClip, englishVoices, voiceStudioUrlError } from "./speech.js";
import { makeLesson, chatTurn, topicFor, TOPICS, TutorError } from "./tutor.js";

const store = createStore();
const today = localDate();
const $ = id => document.getElementById(id);

let settings = { rate: 0.8, voiceName: "", vsUrl: "", vsKey: "", ...store.get("settings", {}) };
let lesson = null;

export function show(screenId) {
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== screenId;
  for (const b of document.querySelectorAll("nav [data-step]")) b.classList.toggle("active", b.dataset.step === screenId);
  $("nav").hidden = screenId === "settings";
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
  const t = store.get(`lesson:${today}`, null)?.topic ?? topicFor(today);
  $("topic").textContent = t[0].toUpperCase() + t.slice(1);
}

let topic = topicFor(today);

$("start").onclick = async () => {
  if (await loadLesson()) show("listen");
};

// Bottom nav: steps need today's lesson, so load it first if needed.
for (const b of document.querySelectorAll("nav [data-step]")) {
  b.onclick = async () => {
    const step = b.dataset.step;
    if (step === "home") { renderHome(); return show("home"); }
    if (!lesson && !(await loadLesson())) return;
    if (step === "shadow") renderShadow();
    if (step === "talk") return enterTalk();
    show(step);
  };
}

// Returns true once `lesson` is set (and the Listen screen rendered); otherwise shows why on Home or Settings.
async function loadLesson() {
  status("home-status", "");
  if (!store.get("apiKey", "")) {
    openSettings("Add your Claude API key to start.");
    return false;
  }
  lesson = store.get(`lesson:${today}`, null);
  if (!lesson && !navigator.onLine) {
    const last = store.get("lastLessonDate", null);
    lesson = last && store.get(`lesson:${last}`, null);
    if (!lesson) {
      show("home");
      status("home-status", "You're offline and there's no saved lesson yet.", true);
      return false;
    }
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
      if (e instanceof TutorError && e.kind === "auth") {
        openSettings(errorText(e));
        return false;
      }
      if (e instanceof TutorError && e.kind === "refusal") topic = TOPICS[(TOPICS.indexOf(topic) + 1) % TOPICS.length];
      show("home");
      status("home-status", errorText(e), true);
      $("start").textContent = "Try again";
      return false;
    } finally {
      $("start").disabled = false;
    }
  }
  renderListen();
  return true;
}

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
  if (shadowIndex === lesson.shadow.length - 1) return enterTalk();
  shadowIndex++;
  renderShadow();
};

document.querySelector('[data-go="shadow"]').addEventListener("click", renderShadow);

// ---------- Talk ----------

const OPENER = "(start the conversation with a simple question about the topic)";
const TALK_SECONDS = 5 * 60;
let talkBusy = false;
let talkTimer = null;
let talkLeft = TALK_SECONDS;
let finishWhenIdle = false;
let talkFails = 0;

const talkLog = () => store.get(`talkLog:${today}`, []);

function renderChat() {
  $("chat").replaceChildren(...talkLog().filter(m => m.content !== OPENER).flatMap(m => {
    const nodes = [el("div", { className: `msg ${m.role}`, textContent: m.content })];
    const c = m.correction;
    if (c) nodes.push(el("div", { className: "fix" }, el("s", { textContent: c.wrong }), " → ", el("strong", { textContent: c.right }), el("div", { className: "muted", textContent: c.why })));
    return nodes;
  }));
  $("chat").lastElementChild?.scrollIntoView({ block: "end" });
}

function setTalkBusy(busy) {
  talkBusy = busy;
  for (const id of ["talk-speak", "talk-send", "talk-input"]) $(id).disabled = busy;
  if (!busy && finishWhenIdle) finishTalk();
}

// Sends one learner turn; correction cards are kept on the assistant entry for display.
async function sendTurn(said) {
  setTalkBusy(true);
  status("talk-status", "…");
  try {
    const log = talkLog();
    const { reply, correction } = await chatTurn({
      apiKey: store.get("apiKey", ""),
      topic: lesson.topic,
      history: log.map(({ role, content }) => ({ role, content })),
      said,
    });
    store.set(`talkLog:${today}`, [...log, { role: "user", content: said }, { role: "assistant", content: reply, correction }]);
    if (correction) store.set("mistakes", addMistakes(store.get("mistakes", []), [{ date: today, ...correction }]));
    status("talk-status", "");
    renderChat();
    say(reply);
  } catch (e) {
    if (e instanceof TutorError && e.kind === "auth") return openSettings(errorText(e));
    status("talk-status", errorText(e), true);
  } finally {
    setTalkBusy(false);
  }
}

function tick() {
  talkLeft = Math.max(0, talkLeft - 1);
  $("talk-timer").textContent = `${Math.floor(talkLeft / 60)}:${String(talkLeft % 60).padStart(2, "0")}`;
  if (talkLeft === 0) {
    clearInterval(talkTimer);
    finishWhenIdle = true;
    if (!talkBusy) finishTalk();
  }
}

async function enterTalk() {
  show("talk");
  talkLeft = TALK_SECONDS;
  finishWhenIdle = false;
  $("talk-timer").textContent = "5:00";
  $("talk-speak").hidden = !canListen();
  renderChat();
  if (!talkLog().length) await sendTurn(OPENER);
  clearInterval(talkTimer);
  talkTimer = setInterval(tick, 1000);
}

function finishTalk() {
  clearInterval(talkTimer);
  finishWhenIdle = false;
  show("review");
}

$("talk-speak").onclick = async () => {
  setTalkBusy(true);
  status("talk-status", "Listening…");
  try {
    const said = await listen();
    talkFails = 0;
    setTalkBusy(false);
    await sendTurn(said);
  } catch (e) {
    talkFails++;
    setTalkBusy(false);
    status("talk-status", talkFails >= 2 ? "Having trouble hearing you — type your answer below." : "I didn't hear anything — try again.", true);
  }
};

$("talk-send").onclick = () => {
  const said = $("talk-input").value.trim();
  if (!said) return status("talk-status", "I didn't hear anything — try again.", true);
  $("talk-input").value = "";
  sendTurn(said);
};

$("talk-input").onkeydown = e => { if (e.key === "Enter") $("talk-send").click(); };
$("talk-finish").onclick = () => (talkBusy ? (finishWhenIdle = true) : finishTalk());

renderHome();
show("home");
