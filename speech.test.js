import assert from "node:assert/strict";
import { voiceStudioUrlError } from "./speech.js";

const MSG = "Use an https:// address (for example via Tailscale). The browser blocks http:// from this app.";

assert.equal(voiceStudioUrlError(""), null);
assert.equal(voiceStudioUrlError("https://mac.tail1234.ts.net"), null);
assert.equal(voiceStudioUrlError("http://localhost:3900"), null);
assert.equal(voiceStudioUrlError("http://127.0.0.1:3900"), null);
assert.equal(voiceStudioUrlError("http://192.168.1.5:3900"), MSG);
assert.equal(voiceStudioUrlError("not a url"), MSG);

console.log("speech ok");
