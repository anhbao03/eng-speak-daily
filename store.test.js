import assert from "node:assert/strict";
import { localDate, createStore, updateStreak, addMistakes } from "./store.js";

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
ok.set("a", { x: 1 });
assert.deepEqual(ok.get("a", null), { x: 1 });
assert.equal(typeof mem.get("a"), "string");

const broken = createStore({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } });
broken.set("b", 2);
assert.equal(broken.get("b", 0), 2);
assert.equal(createStore(undefined).get("missing", "fb"), "fb");

console.log("store ok");
