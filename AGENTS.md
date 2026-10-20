# AGENTS.md — rules for anyone (human or AI) changing Medium Enhancer

Every rule here came from a problem Wesley hit or reported. Read before touching code.

## 1. Updates must reach users promptly (2026-10-20)

Chrome checks the store every few hours and installs a downloaded update only
after the MV3 service worker has been idle ~30 s. The old worker listened to
`tabs.onUpdated` (every page load in every tab), so users stayed on old versions
for hours after the store approved a release.

- Keep `chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload())`.
- **No browser-wide listeners in `src/background.ts`**: no `tabs.onUpdated`,
  `tabs.onActivated`, `tabs.onRemoved`, `windows.*`, `webNavigation.*`.
  Per-page work runs in the content script (Medium pages only) and reports by
  message (`pageReport`); per-tab data lives in `chrome.storage.session`.
- `test/bookshelf-menus.test.ts` fails if a browser-wide listener comes back.
- A fix only helps users once they run a version containing it; they can force
  an update in chrome://extensions → Developer mode → Update.

## 2. Medium is a single-page app

Story → story navigation changes the URL without reloading or activating a tab.
Anything that depends on "which page is this" (context-menu visibility, feeds,
highlights, quote card) must react to the content script's URL check
(`checkCurrentUrl` in `src/contents/index.ts`), not to tab events.
(Bug 2026-10-20: "Highlight to Bookshelf" menu stayed hidden after in-tab navigation.)

## 3. Privacy and account safety

- No backend server. Bookshelf data stays in the extension's IndexedDB; export is the backup.
- **Never write user data into the Medium page DOM** (no notes in `title`/`data-*`):
  Medium's own scripts can read it. Highlights carry only an id; notes are shown
  only on the Bookshelf page. (Bug found in review 2026-10-20.)
- Archive only what the user's open page already shows; never fetch stories in
  the background, never bypass a paywall.
- Pro: only SHA-256 hashes in `src/shared/pro.ts`. Never a plaintext key in any
  shipped file or test; browser tests inject a generated test hash.
- No GitHub links in shipped UI, store listing or docs (repo is private).
  Feedback goes to the release article's comments.

## 4. Testing

- Unit: `for f in test/*.test.ts; do node --experimental-strip-types --no-warnings $f; done`
  (Node 26; not `npx tsx`).
- Browser: `node test/quote-card.browser.mjs` and `node test/bookshelf.browser.mjs`,
  run **locally only**. Never launch Chromium/puppeteer/playwright inside the
  Codex sandbox — it crashes and pops "Chromium quit unexpectedly" on Wesley's Mac.
  Harnesses launch with `--disable-crash-reporter --disable-breakpad`.
- Harness pitfalls:
  - `waitForFunction` polls on requestAnimationFrame, which does not run in a
    background tab: pass `{ polling: 100 }` or `bringToFront()` the page you wait on.
  - Request interception must let `chrome-extension://` requests continue.
  - The Options tab opened on install steals focus; bring the story page to front.
- `loadSource` evaluates modules in a vm realm: copy results
  (`JSON.parse(JSON.stringify(x))`) before `deepStrictEqual`.
- A new module imported by `src/contents/index.ts` needs a stub in
  `test/quote-hover-settings.test.ts`; a new `chrome.*` event in the worker needs
  a mock in the background tests.
- Prove a new test can fail: break the code once, see it red, restore.
- Real Medium pages: headless Chromium is stopped by Cloudflare — do not evade it.
  Check selectors on a signed-out, isolated normal browser page instead.

## 5. UX decisions Wesley made (don't regress)

- Selecting story text shows one toolbar `ME | Highlight | Card`. Highlight saves
  the story first if needed; selecting a highlight or clicking a yellow mark
  offers **Remove highlight** (free, not Pro-gated).
- Hovering a paragraph shows a card icon at its start (Options toggle).
- The quote card panel closes 600 ms after the pointer leaves it, or on an
  outside click; never mid-download/copy or on keyboard-only use.
- Markdown can be downloaded or copied (`Copy .md`, `Copy Page as Markdown`).

## 6. Release checklist

1. Bump `version` in `package.json`; `pnpm build`; all unit + both browser tests.
2. `pnpm package`; copy `build/chrome-mv3-prod.zip` to `~/Downloads/medium-enhancer-<version>.zip`.
   Unzip and check: no plaintext key, the shipped hash is present, the new code is in.
3. Update docs in `~/Repos/blog` (EN + ZH): `source/_posts/medium-enhancer.md`,
   `source/_posts/zh-cn/medium-enhancer.md`, `source/tools/medium-enhancer/index.md`,
   `source/zh-cn/tools/medium-enhancer/index.md`. Wesley adds screenshots to the
   Chinese post; sync the image lines to English. **Commit and push those files**
   (only those — the blog has other people's work in progress).
4. Branches: push feature branches; Wesley merges. Never force-push.

## Known gaps (not bugs, decided later)

Cross-paragraph highlights don't re-mark in the page; the delete-undo bundle
lives in worker memory; ZIP export holds ~3× the archive size in memory.
