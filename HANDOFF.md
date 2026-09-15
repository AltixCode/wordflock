# Wordflock — handoff

> Written 2026-09-15. **Unverified is UNKNOWN, never a pass** — a green build is
> not a verification. Every row below says what was actually run.

**Wordflock** — sixteen words, four hidden groups, four mistakes.
Plan: `/Volumes/ExtremePro/Dev/next_mobile_apps/PLAN.md` (PLAN.md §5).
Portfolio rules: `Dev/AGENTS.md`, then `Dev/docs/agents/18-app-lifecycle.md`.

## State at a glance

| | |
|---|---|
| Stage | **Scaffold only** — the game is not written |
| Tests | 264 passing |
| Device pass | ⬜ never run |
| App Store | metadata, IAP, price, availability and privacy all done; needs screens and content |
| Released | ⬜ no |

> **Logic layer done (puzzle validation, guess rules, daily mapping, share grid). The puzzle bank is 30 entries — one month — which repeats monthly and is NOT shippable as a daily. Screens not built.**

## Verification state

| Gate | State |
|---|---|
| Lint | ✅ |
| Typecheck | ✅ |
| Unit tests (264) | ✅ |
| i18n completeness — 14 locales | ✅ |
| UI rules — colour tokens, `t()` | ✅ |
| iOS + Android bundle export | ✅ |
| CI on a self-hosted runner | 🔨 running when this was written — re-check with `gh run list` |
| `check:release` with real identifiers | ✅ passes in CI |
| Builds / launches on the iOS simulator | ⬜ |
| Interaction driven on the Android emulator | ⬜ |
| Light **and** dark checked on device | ⬜ |
| Purchase flow against a real offering | ⬜ no store product exists yet |
| Ads served under real consent | ⬜ no consent message published yet |

## What is built

**Only the shared scaffold. No game exists yet.**

What the scaffold already gives you, working and tested (264 tests):

- expo-router shell: home placeholder, settings, paywall
- 14 locales with plural and RTL handling, and `check-i18n` / `check-ui-rules`
  failing the build on a partial locale or a hard-coded string
- theme tokens with both appearances, AA contrast asserted by unit test
- RevenueCat behind the single `remove_ads` entitlement, lifetime-only
- AdMob banner, interstitial and rewarded, gated on UMP consent and iOS ATT,
  failing closed
- `npm run check:release`, CI, and the release identifiers already in repo
  secrets

## What is left

1. **Write the game.** Nothing of it exists yet — guess evaluation, one-away detection, curated puzzle bank.
   The plan for this app is `next_mobile_apps/PLAN.md` (PLAN.md §5).
   Follow the pattern the five finished apps use — pure logic in `src/logic/`
   with no React import, generated content verified by a solver, then screens.
2. **Game copy in all fourteen locales.** Use
   `next_mobile_apps/scripts/add_i18n_keys.py` with a keys JSON, the same way
   the finished apps did it; `npm run check:i18n` enforces completeness.
3. **Free tier**, as planned: archive last 7 days, themed packs behind the unlock.
4. **Tests** to the coverage thresholds in `jest.config.js`. CI enforces them
   and a local `jest` run does not — use `npm run test:ci`.
5. **Device pass** — `npm run verify:device`.
6. **Screenshots**, then store records (below), then submit.

## Identifiers — already provisioned, do not recreate

Changing a bundle id means deleting and recreating the RevenueCat app, which
**invalidates its public SDK keys**. These are settled.

| | |
|---|---|
| Bundle id / package | `com.altixcode.wordflock` |
| Scheme | `wordflock://` |
| GitHub | `AltixCode/wordflock` |
| RevenueCat project | `proj8227d35f` |
| RevenueCat iOS app | `appf5fc92387e` |
| RevenueCat Android app | `app4c1436e45d` |
| Entitlement | `remove_ads` (`entl1374376c4e`) |
| Offering / package | `default` (`ofrng724cf43f54`) / `$rc_lifetime` (`pkgee109668077`) |
| AdMob app (iOS) | `ca-app-pub-2504845459806550~6762260526` |
| AdMob app (Android) | `ca-app-pub-2504845459806550~4136097182` |
| AdMob banner (iOS / Android) | `ca-app-pub-2504845459806550/5525200472` / `ca-app-pub-2504845459806550/2954877453` |
| AdMob interstitial (iOS / Android) | `ca-app-pub-2504845459806550/4212118809` / `ca-app-pub-2504845459806550/3561382117` |
| AdMob rewarded (iOS / Android) | `ca-app-pub-2504845459806550/3955124629` / `ca-app-pub-2504845459806550/9272873790` |
| App Store app id | `6812275509` |
| App Store name | Wordflock |
| IAP id / product | `6812277140` / `com.altixcode.wordflock.removeads` |

All ten release identifiers plus `EXPO_TOKEN` are already GitHub repo secrets.
Locally they come from `/Volumes/ExtremePro/Dev/.admob-ids/wordflock.env` —
never commit that file.

## Blocked on a person — cannot be scripted

These three have no write API at all. Browser sessions live in the Playwright
MCP profile (`~/Library/Caches/ms-playwright-mcp/`).

1. **App Store Connect record — done.** App `6812275509` exists, with
   the `remove_ads` non-consumable at $3.99 USA base, auto-equalized, plus a
   free app price schedule and availability in every territory. The store name
   is **Wordflock**, which may differ from the in-app name: App
   Store display names are globally unique and several short ones in this batch
   were already taken.
   Still console-only, and therefore still blocked on a person: the App Privacy
   data-usage questionnaire, and `contentRightsDeclaration` — `PATCH /v1/apps`
   answers 200 for the latter and stores nothing. Without both, adding the
   version to a review submission fails `409 STATE_ERROR.ENTITY_STATE_INVALID`
   while `versions check-readiness` still reports ready.
2. **Play Console app.** A Play app has **no package name until its first bundle
   is uploaded**, so the order is: create app → upload an AAB to internal testing
   → *then* create the `remove_ads` product. Build that first AAB from a
   **non-production** profile so testers generate no live ad impressions.
3. **AdMob GDPR + US-states consent messages.** The apps and all six ad units
   exist, but **no consent message is published**. The SDK can only present a
   message that exists, and this app fails closed — so in the EEA it currently
   shows **no ads at all**. Publish both under Privacy & messaging.

Also expect **"Requires review — limited ad serving"** on every new AdMob app
for a few days. That is normal, not an integration fault.

## Decisions that are the owner's, not an agent's

- Publish on altixcode.com and itsata.com? **Not yet asked.** Procedure:
  `docs/agents/14-portfolio-demos.md`.
- App Store name. Casual and puzzle names are heavily contested; budget several
  attempts. Apple checks the whole title string, so `Name: Descriptor` often
  clears when the bare name does not. ASC names stay editable until first release.

## Traps already paid for — do not rediscover

- `npm run test:ci` enforces coverage thresholds; a plain `jest` run does not.
  CI has caught this twice.
- **A coverage shortfall in CI may not be about coverage.** Jest's default worker
  count exhausted the shared runner's file descriptors — `ENFILE: file table
  overflow` — and three suites failed to LOAD, so their files went uncovered and
  the job blamed the thresholds. `test:ci` runs `--runInBand` for this reason;
  do not remove it.
- **`package-lock.json` must be committed.** Without it every job dies at
  setup-node with "Dependencies lock file is not found", and `npm ci` cannot run
  at all. Generate one without installing: `npm install --package-lock-only`.
- RNTL 14: `render` and `fireEvent` are async — **await both**. Put each
  screen's tests in its own file, and never call `jest.restoreAllMocks()` in a
  screen test: it restores spies the renderer relies on and the next test's tree
  is torn down as it renders.
- Reset a board by **remounting a keyed component**, never by setState in an
  effect — otherwise one frame shows the previous puzzle on the new board.
- Keep gesture hit-testing on the JS thread. A worklet calling a plain JS helper
  throws *"Tried to synchronously call a Remote Function"* on first touch:
  invisible to Jest, fatal on device.
- `expo run:android` wants the **AVD name**, not the adb serial, and can fail in
  seconds leaving the previous APK installed. Always check its exit code.
- iOS verification stops at build / install / launch / render: Simulator.app is
  missing from this Xcode install, so the ATT prompt cannot be dismissed. **Drive
  interaction on Android.**
- Export `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
  for any Android build, or Gradle silently falls back to JDK 25 and CMake dies.
- Shared code is generated. Fix it in `AltixCode/next-mobile-apps` (`_template/`)
  and re-run `node scripts/bootstrap.mjs wordflock`, never in this copy —
  otherwise the next regeneration reverts it.
