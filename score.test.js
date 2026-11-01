import assert from "node:assert/strict";
import { score } from "./score.js";

assert.equal(score("I like green tea.", "i like green tea").percent, 100);

const m = score("I like green tea", "I like tea");
assert.equal(m.percent, 75);
assert.equal(m.words.find(w => w.word === "green").status, "missed");

assert.deepEqual(score("I like tea", "I really like tea").extra, ["really"]);
assert.equal(score("I'm fine, thanks!", "I am fine thanks").percent, 100);
assert.equal(score("I don’t know", "I do not know").percent, 100);
assert.equal(score("I have two cats", "I have 2 cats").percent, 100);

const e = score("Good morning", "");
assert.equal(e.percent, 0);
assert.ok(e.words.every(w => w.status === "missed"));
assert.equal(score("", "anything").percent, 0);

console.log("score ok");
