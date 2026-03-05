# ISU Dining Menu Tools

This repository now contains:

- **Java CLI utility** for fetching ISU Dining menus and printing them in a
  clean text format (original project).
- **Web app + backend API** for selecting your favorite foods and seeing when
  they are served over the next week.

Menu data ultimately comes from the public ISU Dining JSON endpoint used on
[`dining.iastate.edu`](https://www.dining.iastate.edu/hours-menus).

## Structure

- `src/main/java/...` – original Java CLI client.
- `src/main/resources/locations.json` – configuration for the Java client.
- `server/` – Node/Express backend that aggregates ISU menus into a simple API.
- `frontend/` – static HTML/JS/CSS web app that calls the backend and shows
  favorites.

## Running the backend API

The backend exposes a simple HTTP API that the web app uses. It calls the same
JSON endpoints as the Java CLI, for several locations and days ahead, and
returns a flattened list of when each food item is served.

From the `server` directory:

```bash
cd server
npm install
npm start
```

By default this starts the server on `http://localhost:4000`.

### API

- `GET /api/menu?days=N`

  - `days` – optional, number of days ahead to check (default `7`, min `1`,
    max `14`).
  - Response:

    ```json
    {
      "entries": [
        {
          "date": "2026-03-05",
          "locationSlug": "seasons-marketplace-2-2",
          "locationTitle": "Seasons Marketplace",
          "facility": "Maple-Willow-Larch Commons",
          "mealName": "Lunch",
          "stationName": "Grill",
          "categoryName": "Entrees",
          "itemName": "Orange Chicken",
          "startTime": "11:00:00",
          "endTime": "14:00:00",
          "active": true
        }
      ]
    }
    ```

- `GET /api/health` – simple health check.

> Note: The backend uses a `time` query parameter on ISU's JSON endpoint to
> approximate per‑day menus for the days ahead. If ISU adjusts that API, you
> may need to tweak `server/index.js`.

## Running the frontend locally

The frontend is a static site, so you can either open it directly from disk or
serve it with any static file server.

1. Make sure the backend is running on `http://localhost:4000` (see above).
2. Open `frontend/index.html` in your browser.

The app will:

- Load menus for the configured number of days ahead.
- Build a list of all unique food item names.
- Let you select the ones you like.
- Store your selections in browser storage so they are remembered on the next
  visit in the same browser.
- Show a grouped view of when/where each favorite is served.

If you deploy the backend somewhere else (e.g. Railway, Render, etc.), you can
set `window.ISU_DINING_API_BASE` before loading `main.js` in `index.html` or
wrap the frontend in your own hosting environment.

## Deploying to GitHub Pages

For GitHub Pages you can:

- Put the contents of `frontend/` in the branch/folder that Pages serves
  (e.g. `gh-pages`), and
- Point the app at your hosted backend API (not GitHub Pages) by defining
  `window.ISU_DINING_API_BASE` in a small inline script in `index.html`.

The backend cannot run on GitHub Pages itself (it is static-only) but can be
hosted on any Node-friendly platform.
