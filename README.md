# SemperFit365

Turns a Google Sheet workout program into a simple, mobile-friendly workout app: pull in your program, log what you actually lift each week, and see your history — all on your phone.

No build step, no backend, no account required. It's a static site that reads your program from Google Sheets (or a pasted/uploaded CSV) and keeps everything you log in your browser.

## How it works

1. **Import a workout day** — either:
   - Paste the link to a Google Sheet tab that's shared as *"Anyone with the link can view"* (Share → General access → Anyone with the link). The app fetches it as CSV directly in the browser — nothing is uploaded to a server.
   - Or select the cells for one day in Google Sheets, copy, and paste them straight into the app.
   - Or export a tab as CSV (File → Download → Comma Separated Values) and paste/upload it instead. Use this if your sheet is private and you'd rather not change sharing settings.
2. **Review** — the app detects the exercises, rep goals, rest times, and week-by-week columns automatically. Give the day a name (e.g. "Friday — Workout C") and add it to your program.
3. **Run your program** — each imported day is a list of exercises. Tap into one to see its rep goal, rest time, and a card per week with an input for each set column (whatever your sheet uses — Set 1/2/3, WU set, etc.) plus notes. Fill in this week's numbers as you train; it saves automatically.
4. **History** — every set value you've entered shows up in the History tab, most recent first, so you can jump back into any exercise.
5. Import as many days as your program has (Monday, Wednesday, Friday, etc.) — each is added separately from Settings → "Import another day."

## Expected sheet format

This is built for the common "block per exercise, weeks as rows" training-log layout:

```
                Phase 1 - Friday (WORKOUT C)

Incline BB Bench Press      Rep goal: 5-10        Rest time: 2-3 min.
Perform 2-3 warm-up sets of 6 reps...

Week   WU set   Set 1   Set 2   Set 3            Notes
1      WEEK 1
2      WEEK 2
...
8      WEEK 8

Dips                         Rep goal: 4-6, 6-8, 8-10   Rest time: 2-3 min

Week   Set 1   Set 2   Set 3            Notes
1      WEEK 1
...
```

The importer finds this structure automatically:
- A title line at the top becomes the day's name.
- Each exercise's name, "Rep goal:", and "Rest time:" are read from its header line (any of the three is optional).
- The row containing a **Week** cell defines that exercise's columns — everything between `Week` and a `Notes` column (if present) becomes an editable "set" field, using whatever label your sheet has (Set 1, WU set, etc.).
- Exercise blocks don't need to be separated by blank rows or follow the exact same column layout — each is detected on its own.

If your sheet is a flatter, one-row-per-exercise table instead, export/paste it anyway — as long as there's a `Week` header cell somewhere the importer will pick up the columns after it; otherwise open an issue/ask for the flat-table format to be added back in.

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
- One Google Sheet tab (gid) = one workout day. Import each day of your program separately from Settings.
- Merged cells or ragged rows in the source sheet can occasionally shift a value into the wrong column on import (the app reads columns by position, faithfully, without guessing) — everything is editable after import, so just retype anything that landed wrong.
- Settings → a day's "Refresh" button re-pulls that day from its Google Sheet and updates exercises/rep goals/rest times, while keeping anything you've already logged for a given week.
