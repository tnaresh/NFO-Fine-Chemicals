# NFO-Fine-Chemicals

Production register and dashboard for Neo Fine Chemicals, with search, add/edit/delete, CSV/JSON export, and printable product labels. Each record has a product name plus CAS NO, CAT NO, BATCH NO, M. F, Mol . Wt, Density, and Pack size. Label sizes include 4 × 3, 4 × 2, 1 × 3, and 3 × 1 inches.

## Run locally

For everyday use on Windows, double-click **Start Neo Fine Chemicals.bat**. A PowerShell window will open, and the app will open in your browser. Keep the PowerShell window open while using the app; closing it stops the server. Your data remains saved.

If needed, you can start it manually from PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
```

The app address is <http://localhost:8000>. For shared data, always use that address rather than opening `index.html` directly.

### Windows 7

Run **Start Neo Fine Chemicals.bat** and use Chrome or Firefox; the launcher opens one of those browsers when installed. Internet Explorer is not supported, and opening `index.html` directly can trigger Internet Explorer's local-script security restriction. The server supports the Windows PowerShell 2.0 included with Windows 7 by using the .NET Framework `System.Web.Extensions` JSON serializer; if that assembly is unavailable, install or enable the .NET Framework 3.5 feature.

Windows 7 is no longer supported by Microsoft, and current browser releases do not support it. Any browser version that still runs on Windows 7 is outdated and may have security vulnerabilities. Use this setup only on a trusted computer and upgrade Windows for continued secure use.

## Project layout

- `index.html` contains the page structure and form/dialog markup.
- `styles.css` contains the screen and print styles.
- `js/app.js` handles rendering, user interactions, CSV/JSON export, and label printing.
- `js/productionRepository.js` uses the JSON API in server mode and browser storage when opened directly as a file.
- `start-server.ps1` serves the app and its local JSON API.
- `Start Neo Fine Chemicals.bat` is the double-click launcher for Windows.
- `data/production-items.example.json` provides clean sample records for first startup.

## Data storage

When served through `start-server.ps1`, records are saved in the ignored local file `data/production-items.json`; every browser using `http://localhost:8000` reads and updates that same file. If this file does not exist, the server initializes it from the tracked `data/production-items.example.json` sample. The live data file is excluded from Git so production records are not accidentally published. The server listens only on this computer, so it does not synchronize with other computers or over the internet.

Opening `index.html` directly still works, but stores data separately in that browser's `localStorage` under `chemicalProductionItems_v1`; it does not sync with server mode or other browsers. To move records from direct-file mode, use **Export JSON** and copy the downloaded file over `data/production-items.json` while the server is stopped. Back up the JSON file regularly.

To hand the app to another person, copy the entire project folder to their computer, preserving the `data` and `images` folders, then have them double-click the `.bat` launcher. If Windows displays a security prompt, allow the script to run only if this is the copy you provided.
