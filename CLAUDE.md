# Working on this repo

## Shipping changes

- Commit and push finished changes straight to `main`. Pushing to `main` deploys the app, and that's intended: don't ask first, and don't park the work on a side branch or open a pull request.
- The exception: if the user asks to be consulted before a change goes live, leave it on a branch and wait for their go-ahead.
- Before pushing, run `npm test` (and the relevant `tests/e2e/*.cjs` scripts when the UI changes), bump `VERSION` in `sw.js` so phones pick up the update, and set `BUILD` in `js/version.js` to the same number. That build number shows in Settings > About so Ben can check which version his phone is running; `npm test` fails if the two disagree.
