# Eindhoven vacancy map

A small static web app (no backend, no build step) to log vacant or abandoned buildings on a map, from a phone or a computer.

- Points are categorised mainly by **occupancy**: vacant (strong signs), probably vacant, occupied, unsure.
- Each point also has type, visible condition, observed signs, address, notes and survey date.
- Base maps (switch with the layer button): PDOK/Kadaster map and aerial photos (Dutch open data, no API key) and OpenStreetMap.
- Export / import as GeoJSON (opens in QGIS).

## Run locally

    python3 -m http.server 8000

then open http://localhost:8000. Opening `index.html` straight from disk may block map tiles; use a local server or GitHub Pages.

## Deploy on GitHub Pages

Repo → Settings → Pages → Deploy from branch → `main` / root.

## Privacy and security

- Data stays in your browser (`localStorage`). Nothing is sent anywhere: there is no backend and the Content-Security-Policy sets `connect-src 'none'`.
- No third-party scripts: Leaflet 1.9.4 is vendored in `vendor/leaflet`, and the CSP allows scripts from this site only.
- Map tiles are the only external requests (images from PDOK and OpenStreetMap). They see your IP address and the tile area you view, not your points.
- Pin text is rendered with `textContent` (no `innerHTML`), and anything loaded from storage or an imported file is validated against an allowlist.
- `localStorage` is shared by every page on the same origin. On `username.github.io` that includes all your other GitHub Pages sites, so keep other projects there free of untrusted code, or use a custom domain / separate host (Cloudflare Pages, Netlify) to get an isolated origin.
- `*.geojson` and `*.csv` are git-ignored so exported survey data is not committed by accident.

## Licences

Code: choose one (e.g. MIT). Leaflet: BSD-2-Clause (`vendor/leaflet/LICENSE`). Map data: see PDOK and OpenStreetMap terms and keep the attributions shown on the map.
