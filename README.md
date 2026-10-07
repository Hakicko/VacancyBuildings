# Eindhoven vacancy map

A small static web app (no backend, no build step) to log vacant or abandoned buildings on a map, from a phone or a computer.

- Points are categorised mainly by **occupancy**: vacant (strong signs), probably vacant, occupied, unsure.
- Each point also has type, visible condition, observed signs, address, notes and survey date.
- Base maps (switch with the layer button): PDOK/Kadaster map and aerial photos (Dutch open data, no API key) and OpenStreetMap.
- **Paths**: draw a route by tapping vertices (**Path**, then **Finish** or Enter), or record it with GPS while you cycle (**Rec**, then **Stop**). Click a path to name it or delete it. Each finished path is listed separately in the legend (unnamed ones as Path 1, Path 2…) with its length; use the checkbox to hide one and click its name to zoom to it. With more than 5 paths the list collapses into a single group you can expand.
- **Saving**: every change is autosaved in the browser. **Save** (Ctrl/Cmd+S) also writes a `.geojson` file: the first time you choose where, afterwards it overwrites the same file silently (Chrome/Edge on desktop). **Save as** (Ctrl+Shift+S) picks a new file. Browsers without this feature (Safari, Firefox, most phones) download a copy instead. **Import** merges a saved file back in. The file opens in QGIS.

## Keyboard

| Key | Action |
| --- | --- |
| Ctrl/Cmd + S | Save to file (Ctrl/Cmd + Shift + S: save as) |
| Ctrl/Cmd + Z | Undo (while drawing a path: remove the last vertex) |
| Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z | Redo |
| Delete / Backspace | Delete the selected point or path (click it first) |
| Enter / Esc | Finish / cancel the path being drawn |

Undo and redo also have buttons for the phone. Shortcuts are ignored while you type in a form field.

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
