# SemperFit365

Turns a Google Sheet workout program into a simple, mobile-friendly workout app you can run through at the gym: check off sets, log the weight/reps you actually did, and see your history — all on your phone.

No build step, no backend, no account required. It's a static site that reads your program from Google Sheets (or a pasted/uploaded CSV) and keeps your logs in your browser.

## How it works

1. **Import your program** — either:
   - Paste the link to a Google Sheet that's shared as *"Anyone with the link can view"* (Share → General access → Anyone with the link). The app fetches it as CSV directly in the browser — nothing is uploaded to a server.
   - Or export your sheet as CSV (File → Download → Comma Separated Values) and paste the contents / upload the file instead. Use this if your sheet is private and you'd rather not change sharing settings.
2. **Match your columns** — the app guesses which of your columns are Exercise, Sets, Reps, Weight, Week, Day, Rest, Notes, etc. based on the headers, and lets you fix any it got wrong.
3. **Run your workouts** — your sheet is grouped into workouts by Week + Day. Tap a day, check off each set as you go, and type in the actual weight/reps you used. "Last time" shows what you logged last time you did that day, for progressive overload.
4. **History** — every finished workout is saved locally (browser `localStorage`) so you can look back at what you lifted.

## Expected sheet format

Works best as one row per exercise, e.g.:

| Week | Day              | Exercise      | Sets | Reps | Weight | Rest | Notes            |
|------|------------------|---------------|------|------|--------|------|-------------------|
| 1    | Day 1 - Push     | Bench Press   | 4    | 8    | 135    | 90s  |                   |
| 1    | Day 1 - Push     | Overhead Press| 3    | 10   | 65     | 60s  | Keep core tight   |
| 1    | Day 2 - Pull     | Barbell Row   | 4    | 8    | 115    | 90s  |                   |

Column names don't need to match exactly — the mapping screen lets you point any of your headers at these fields, and `Week`/`Rest`/`Notes`/`Category` are optional (omit them and everything still works, just grouped more simply).

## Running it locally

No dependencies to install. From the project folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

## Deploying (GitHub Pages)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the repo, go to **Settings → Pages**, set Source to the branch you want to publish (e.g. `main`), root folder `/`.
3. Your app will be live at `https://<username>.github.io/<repo>/` — add it to your phone's home screen for an app-like experience (it's an installable PWA).

Any other static host (Netlify, Vercel, Cloudflare Pages, S3, etc.) works too — there's nothing to build, just serve the files as-is.

## Notes & limitations

- Google Sheets' CSV export only works for sheets shared publicly (or published to the web). Fully private sheets need the paste/upload path instead.
- Data lives in your browser's local storage. Clearing site data / using a different browser or device starts fresh. There's no sync between devices.
- Only one sheet "tab" (gid) is imported at a time. If your program spans multiple tabs, import the one you want active, or put everything on one tab with a `Week` column.
