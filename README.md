# The Land

A living deep-time diorama for a second screen, an idle display, or a few minutes of close observation. Civilizations rise, cross oceans, make war, and disappear while the landscape carries their traces forward.

[Watch the live world](https://the-land-chi.vercel.app/)

## Viewer controls

- Pause or resume the simulation.
- Cycle between 1x, 2x, and 4x speed.
- Toggle ambient sound.
- Open the chronicle of world events.
- Revisit up to ten remembered worlds in the local archive.
- Recognize and share each seeded world by its deterministic name.
- Begin a new world.
- Share the current seed as a stable URL.
- Opt in to keeping the display awake.
- Enter fullscreen.

Each generated world is identified by its `?seed=` URL parameter. Developer tools are intentionally hidden from the public view; append `?debug=1` to expose them, or `?intro=1` to replay the introduction.

## Development

```bash
npm install
npm run dev
```

Run `npm run build` before publishing. The production Vercel project deploys from the repository's `main` branch.

## Technology

TypeScript, PixiJS, and Vite. The simulation and presentation code are released under the repository's MIT license. Third-party asset notes are collected in [CREDITS.md](CREDITS.md).
