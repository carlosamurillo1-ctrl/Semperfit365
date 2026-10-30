# Tests

Plain Node scripts, no framework. Serve the repo and run them:

```sh
python3 -m http.server 8123          # from the repo root
node tests/smoke.js                  # every screen renders, no page errors
node tests/dashboard.js              # the Me tab: compliance, food, weight
```

They drive a real browser via Playwright (`NODE_PATH` may need to point at a
global install, and `CHROME=/path/to/chromium` overrides the browser).

**Why these live here.** Earlier suites were written to a scratch directory and
were lost with the container. A test you can't re-run after a restart isn't a
test, so anything worth keeping goes in this folder and gets committed.
