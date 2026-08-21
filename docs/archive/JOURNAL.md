# Journal

## 2026-05-15 — first session
Empty Pixi canvas on screen. Dev env: WSL2, TypeScript + Vite + Pixi v8, 
repo at ~/code/the-land. Hot reload working.

Gotchas hit:
- `npm install pixi.js` didn't take on the first pass — had to rerun and 
  restart Vite to clear cached deps.
- Git auth: GitHub no longer accepts passwords for HTTPS. Used a Personal 
  Access Token (https://github.com/settings/tokens, `repo` scope). Cached 
  by git's credential helper, so single paste-in.

Next session: static 48×48 isometric grid, colored squares per biome. 
No simulation yet — just confirm Pixi's iso math feels right at viewing scale.
