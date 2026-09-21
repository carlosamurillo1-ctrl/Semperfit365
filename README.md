# SemperFit365

Turns a Google Sheet workout program into a simple, mobile-friendly workout app: pull in your program, log what you actually lift each week, and see your history — all on your phone.

No build step, no backend required to run it, no account required for a client to use it. It's a static site that reads your program from Google Sheets (or a pasted/uploaded CSV) and keeps everything you log in your browser — with an optional coach sync layer (see below) if you want to see what a client logs.

## Coach sync — seeing what a client logs, live

By default nothing leaves a device: all data lives in that browser's local storage only. If you want to actually see a client's logged sets as they train, wire up the free (no-cost-tier) cloud sync:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com) → **Build → Firestore Database → Create database** (production mode, any location).
2. In **Firestore Database → Rules**, paste the contents of `firestore.rules` from this repo and publish. This is what keeps client data private — access requires knowing the exact random client/coach id, and neither collection can be listed/enumerated without one.
3. **Project settings → Your apps → add a Web app**, and copy the `firebaseConfig` object it gives you into `js/firebaseConfig.js`, replacing the `"REPLACE_ME"` placeholders.
4. Deploy. Coach sync is otherwise a no-op — nothing changes for anyone until this file has real values.

Once configured:
- **As the coach**: open the app → Settings → **"Open coach dashboard"** → **"+ Add client"** → name them and you get a shareable link.
- **Send that link to your client.** The moment they open it, their program and every set they log syncs to you automatically — no account, no password on their end. It's an "anyone with the link" model, same as sharing a Google Doc.
- **Watching live**: from your coach dashboard, tap into a client to see their days, then an exercise to see their week-by-week log update in real time as they train (via Firestore's live listeners — no refresh needed).
- A client can optionally set "Your name" in their own Settings so you see something friendlier than the label you gave them.
- This is intentionally simple, not enterprise security: a client/coach id is a long random string (`crypto.randomUUID()`) that functions like a capability link. That's an appropriate bar for workout logs shared with people you already know, not for sensitive data.

## Charging clients — Zelle paywall + real sign-in

When you set a **Price** while adding a client (Coach dashboard → Add client), that specific client's link works differently from a free one: they have to verify a real email and you have to confirm payment before their program unlocks. Everything below is optional — leave the price field blank and a client's link works exactly as described above, no sign-in, no payment step.

**Why sign-in is required at all, and what it doesn't do:** Zelle has no API, so nothing — not this app, not any app — can automatically detect that a payment landed in your account. You confirm payment yourself (check your bank/Zelle app), then tap **Mark as paid** on that client in your coach dashboard; their already-open app unlocks automatically within seconds via a live listener, no visit to their device needed. The email sign-in step is a real identity check (they have to own that inbox), which is a meaningful step up from a bare link, but it isn't a hard security wall — the Firestore rules stay open the same way they already are for the coach's own dashboard, so enforcement of "don't show the program until paid" happens in the app itself, not the database. That's an appropriate bar for gating access with clients you already know, same spirit as the rest of this app's security model.

**One-time setup, in order:**

1. **Turn on Firebase Authentication.** In the [Firebase console](https://console.firebase.google.com) for this project → **Build → Authentication → Get started** → under **Sign-in method**, enable **Email/Password**, then toggle on **Email link (passwordless sign-in)** for it. Nothing else to configure.
2. That's it for the sign-in + payment-gate screens to work. Test it: add a client with a price, open the generated link in a private/incognito window, and you should land on a "Verify your email" screen instead of the normal program.

**Optional: automatic receipt emails.** By default, marking a client paid unlocks their app but sends no email — they'll just see it unlock. To also send them an automatic receipt:

1. **Upgrade to the Blaze plan.** Firebase console → the little gear icon → **Usage and billing** → **Modify plan** → Blaze. This requires a card on file but includes the same free monthly quota as the free plan — realistic usage here (a receipt email each time you confirm a payment) stays well under it. Consider setting a budget alert on the linked Google Cloud project so you'd be notified of any unexpected charge.
2. **Create a free SendGrid account** at [sendgrid.com](https://sendgrid.com), verify a sender address under **Settings → Sender Authentication** (use `semperfit365@gmail.com`, or whichever address you want receipts to come from — it must be verified there or SendGrid will reject the send), and create an API key under **Settings → API Keys** (Full Access is simplest).
3. **Install the Firebase CLI and log in**, once, on your own computer: `npm install -g firebase-tools`, then `firebase login`.
4. From this project's folder, install the function's dependencies: `cd functions && npm install`.
5. Set the SendGrid key as a secret (you'll be prompted to paste it): `firebase functions:secrets:set SENDGRID_API_KEY`.
6. Deploy: `firebase deploy --only functions`.

From then on, every time you tap **Mark as paid**, `functions/index.js` fires automatically and emails a receipt to whatever address the client signed in with. If you ever change the sender address, update `FROM_EMAIL` at the top of that file and redeploy.

**Contact info shown to clients.** The "Email coach" / "Text coach" buttons on the paywall and Settings screens, and the Zelle address shown on the payment screen, come from `COACH_EMAIL` / `COACH_PHONE_DISPLAY` / `COACH_PHONE_HREF` near the top of `js/app.js` — update those three constants if either ever changes.

## Sending this to someone (e.g. a client)

The app ships with a default program baked in (`js/seedProgram.js`) — anyone who opens the link for the first time sees it immediately, no import step required. It only applies on a device's very first visit: once a program exists in that browser (seeded or imported), it's never overwritten automatically, even if every day is later deleted.

To change the bundled program, replace the text inside the template literal in `js/seedProgram.js` with your own sheet data (same paste/export format as the in-app importer — see below), or edit `SEED_SHEET_TEXT` to an empty string (`""`) to ship the app with no default program, so every visitor lands on the normal Import screen instead.

## How it works

1. **Import a workout day** — either:
   - Paste the link to a Google Sheet tab that's shared as *"Anyone with the link can view"* (Share → General access → Anyone with the link). The app fetches it as CSV directly in the browser — nothing is uploaded to a server.
   - Or select the cells for one day in Google Sheets, copy, and paste them straight into the app.
   - Or export a tab as CSV (File → Download → Comma Separated Values) and paste/upload it instead. Use this if your sheet is private and you'd rather not change sharing settings.
2. **Review** — the app detects the exercises, rep goals, rest times, and week-by-week columns automatically. If you pasted more than one day at once (e.g. you copied several tabs' worth of cells together), it splits them into separate days automatically — give each a name (or accept the detected one) and choose which to add.
3. **Run your program** — each imported day is a list of exercises. Tap into one to see its rep goal, rest time, and a card per week with an input for each set column (whatever your sheet uses — Set 1/2/3, WU set, etc.) plus notes. Fill in this week's numbers as you train; it saves automatically.
4. **History** — every set value you've entered shows up in the History tab, most recent first, so you can jump back into any exercise.
5. Import as many days as your program has (Monday, Wednesday, Friday, etc.) — either all at once, or one at a time from Settings → "Import another day."

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
- Data lives in your browser's local storage. Clearing site data / using a different browser or device starts fresh, unless you've set up coach sync (see above).
- One Google Sheet tab (gid) = one workout day. Import each day of your program separately from Settings, or paste several days at once — the importer splits on lines that mention a weekday (Monday–Sunday) or "Phase N" and reviews each as its own day.
- Merged cells or ragged rows in the source sheet can occasionally shift a value into the wrong column on import (the app reads columns by position, faithfully, without guessing) — everything is editable after import, so just retype anything that landed wrong.
- Settings → a day's "Refresh" button re-pulls that day from its Google Sheet and updates exercises/rep goals/rest times, while keeping anything you've already logged for a given week.
