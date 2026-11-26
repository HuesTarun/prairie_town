# PRAIRIE TOWN: Coterie & Burrow

An interactive browser colony simulation built with zero dependencies (vanilla HTML5 Canvas, CSS3, Web Audio API, and modular JavaScript).

## Play Locally
Open `index.html` directly in Chrome/Edge/Firefox, or serve the root folder with any static HTTP server.

## Deploy on Render (Static Site)
This project is 100% static and requires no build server:
1. Push the repository to GitHub/GitLab.
2. In Render, click **New + -> Static Site**.
3. Connect the repository with:
   - **Build Command:** *(leave empty)*
   - **Publish Directory:** `.`
4. Deploy!

The compact **Players (`👥`)** counter in the top-right HUD uses the static-friendly `countapi.mileshilliard.com` JSON API with `localStorage` deduplication so each unique browser counts once without needing a backend database on Render.

## Run Automated Tests
```bash
node tests/verify_sim.js
```

