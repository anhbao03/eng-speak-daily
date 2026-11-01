import assert from "node:assert/strict";
import { parseReply, topicFor, TOPICS, TutorError } from "./tutor.js";

const msg = (text, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
});

assert.deepEqual(parseReply(msg('{"a":1}')), { a: 1 });
assert.throws(() => parseReply(msg("", "refusal")), e => e instanceof TutorError && e.kind === "refusal");
assert.throws(() => parseReply(msg('{"a":', "max_tokens")), e => e.kind === "truncated");
assert.throws(() => parseReply(msg("not json")), e => e.kind === "bad_json");
assert.throws(() => parseReply({ stop_reason: "end_turn", content: [] }), e => e.kind === "bad_json");

assert.equal(topicFor("2026-11-01"), topicFor("2026-11-01"));
assert.notEqual(topicFor("2026-11-01"), topicFor("2026-11-02"));
assert.ok(TOPICS.includes(topicFor("2025-06-01")));

console.log("tutor ok");
