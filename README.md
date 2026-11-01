# Daily English

A phone-first web app for 15 minutes of English listening and speaking every
day: Listen → Shadow → Talk (with Claude) → Review. Plain static files, no
build step. Spec: `docs/specs/`, plan: `docs/plans/`.

Run locally: `python3 -m http.server 8000`, then open http://localhost:8000.

Test: `node score.test.js && node store.test.js && node speech.test.js && node tutor.test.js`

## Device notes

Results of `spike.html` (Speak / Listen) per device:

| Device | Speak | Listen | Notes |
|---|---|---|---|
| iPhone Safari | | | |
| iPhone home-screen app | | | |
| Android Chrome | | | |
