# Knowledge Media — the shipped leg

Files the chat's answers can offer a signed-in member: a video, an ebook, a
recording. They are referenced by **path**, and the path is strict on purpose:

- `<topic-slug>/<file>.<ext>` — exactly two segments, nothing else.
- Segments are lowercase `a–z 0–9 -`, hyphens only between runs. No spaces,
  no umlauts, no underscores, no second dot.
- The extension must be one the app can honestly describe to a browser:
  `mp4 webm mp3 ogg wav jpg jpeg png webp pdf`
  (the allow-map in `lib/knowledge-media/rules.mjs` — the only authority).

Example: `onboarding/intro-video.mp4`, offered in the handbook as
`[media:onboarding/intro-video.mp4|Watch the intro (3 min)]`.

## Two legs, one namespace

- **Up to 10 MB**: the file lives here, in this folder, committed with the app.
- **Over 10 MB**: it belongs in the app's object store under
  `knowledge/<path>` — same path, same marker, same URL; only the storage
  moves. `node run.mjs kb-check` names any file here that is over the cap.

Either way it is served by `/api/knowledge-media/<path>` — **session-gated**:
signed-in members get the file, everybody else gets a 404. Nothing in this
folder is world-readable through the app.

This README itself is unservable by construction — its name violates the path
grammar twice (uppercase, and `.md` is not in the allow-map). It exists so the
folder ships committed.
