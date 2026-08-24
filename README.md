# The Land

A deep-time diorama. Leave it running, or watch it closely; it does not behave differently either way. Civilizations rise, cross oceans, make war, and disappear while the landscape carries their traces forward. Then the world ends, and another begins.

[Watch the live world](https://www.theland.world/)

## Viewer controls

Eight controls. None of them directs what civilizations do — there is nothing to place, build or command:

- Pause or resume.
- Cycle speed: 1x, 2x, 4x, 8x. It returns to 1x when a world begins to end.
- Open the chronicle of world events.
- Revisit up to ten remembered worlds in the local archive.
- Begin a new world. This replaces the current one entirely rather than steering it.
- Share.
- Opt in to keeping the display awake.
- Enter fullscreen.

## Worlds, seeds and records

A world is identified by its `?seed=` URL parameter, and a seed reproduces **the same land and the same beginning** — not the same history. Catastrophes are decided outside the seeded stream, so no two viewings of a world share their disasters.

When a world ends it leaves a **record**: what it was called, how it ended, its epitaph and three facts about it. That record can be copied as a self-contained link which opens at `/w/` without running the simulation — the thing worth sending to someone who has not got fifteen minutes to watch a world die.

Developer tools are hidden from the public view; append `?debug=1` to expose them, or `?intro=1` to replay the doorway.

## Development

```bash
npm install
npm run dev
```

Run `npm run build` before publishing. The production Vercel project deploys from the repository's `main` branch.

## Technology

TypeScript, PixiJS, and Vite. The simulation and presentation code are released under the repository's MIT license. Third-party asset notes are collected in [CREDITS.md](CREDITS.md).
