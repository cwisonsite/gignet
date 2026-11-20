# GigNet — Gig Order Net Profit Calculator & Session Dashboard

A fast, zero-dependency, mobile-first web app for evaluating gig delivery offers (DoorDash, Uber Eats, Instacart, Spark, Grubhub, etc.) in real time and logging shift totals.

## Project Structure

- `index.html` — Mobile-first semantic layout with thumb-friendly inputs, live verdict card, session dashboard, and slide-over assumptions drawer.
- `styles.css` — Responsive Vanilla CSS with Dark (night driving) and Light (daylight) themes, tabular numerals, and proportional cost breakdown bar.
- `calculator.js` — Pure, framework-free ES module containing all cost math, verdict evaluation, session aggregation, and CSV export logic. Zero DOM dependencies so it can be reused directly in an Android overlay, WebView shell, or sync worker.
- `storage.js` — Thin `localStorage` persistence wrapper for settings, logged orders, and theme preference.
- `app.js` — Thin DOM controller wiring live updates, drawer state, order logging, and file exports.
- `manifest.json` — PWA web app manifest for Add-to-Home-Screen installation.

## Default Cost Model (All Editable in Settings)

| Parameter | Default | Effective Rate |
| --- | --- | --- |
| Gas Price | `$3.40 / gal` | — |
| Fuel Economy | `15.5 MPG` | `$0.2194 / mi` |
| Repair Reserve | `$500 / 10,000 mi` | `$0.0500 / mi` |
| Oil Change Reserve | `$65 / 5,000 mi` | `$0.0130 / mi` |
| Tire Wear & Tear | `$600 / 40,000 mi` | `$0.0150 / mi` |
| **Total Base Vehicle Cost** | — | **`$0.2974 / mi`** |
| Optional Buffer / Tax Set-Aside | Off (`$0`) | Shown separately when enabled |
| 2026 IRS Mileage Reference | `$0.76 / mi` | Tax reference only (not mixed into cash cost) |

## Preview Locally

Because ES modules (`type="module"`) are used, serve the folder over HTTP (for example with Python or Node):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser or phone on the same network.
