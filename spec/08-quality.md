# 08 · Quality

i18n and URLs, accessibility, performance. States refer to `04-user-flow-state-machine.md`. Q-numbers refer to `03-open-questions.md`. Analytics is in `07-analytics.md`.

Marks: **[D]** in `docs/` · **[A]** our rule.

## Checks

Every expectation below names its check. No check = not an expectation.

- **unit**: Vitest + Testing Library, next to the module.
- **e2e**: Playwright against the mock (`MOCK_TIME_SCALE=50`).
- **axe**: `@axe-core/playwright` inside e2e, rules `wcag2a, wcag2aa, wcag21aa, wcag22aa`, zero violations. New dev dependency: automated WCAG checks on every screen, the only way to cover all of them in CI.
- **Lighthouse**: Lighthouse CI, mobile preset (mid-range phone, 4× CPU throttle, slow 4G), median of 3 runs on the static build. New dev dependency: budgets fail the build.
- **build**: a script in `next build` (no dependency).
- **manual**: release checklist, VoiceOver iOS Safari + TalkBack Android Chrome, before each market launch.

**In the slice**: unit, e2e (happy path + `payment_declined` + `payment_slow`, PLAN 2.8) with axe on every screen they reach. **Post-slice**: Lighthouse, build scripts, fallback e2e (needs the built `out/` behind a static server that serves `404.html`; `next dev` routes differently; `resolvePair` is unit-tested in the slice), axe on the other states, manual.

## i18n and URLs

What the docs give: "Estonian, Latvian, Lithuanian and English" [D brief], not 3 × 4. The CMS has one entry per market and language [D CMS]; fixtures have 6 pairs: local + `en` per market (Q24). No URL rule [D] (Q14).

### Routes

| Route | Pairs / rule | Check |
|---|---|---|
| `/{market}/{locale}/` (Plans), `/{market}/{locale}/review/` etc. | `ee/et`, `ee/en`, `lt/lt`, `lt/en`; `lv/lv`, `lv/en` only with `market.LV` on (Q13). Lowercase. `generateStaticParams` builds exactly these | build: page list = enabled pairs. e2e: each pair renders its CMS `headline` |
| `/auth/callback`, `/payment/return` | No market or locale in the path [D API, Mock]. Fixed by the provider allowlist (02) | e2e |
| `/` | Client redirect: first `navigator.languages` match among enabled pairs, else `/ee/et/`. Static export can't read `Accept-Language`, so Q14 is done client-side. `en` tie-break between markets: Q55 | unit (pick function), e2e |
| `<html lang>` | = locale on every page. Callbacks: static HTML has a fixed `lang`, so it renders no text until context is read and `lang` is set | e2e: on callbacks, `lang` = context locale before the first text node appears |

### Fallback

| Input | Result | Check |
|---|---|---|
| Uppercase `/EE/ET/` | → `/ee/et/` | e2e |
| Valid market, unknown locale (`/ee/ru/`, `/ee/lv/`) | → `/{market}/{local}/` | unit, e2e |
| Unknown market, or LV with flag off | → `/` (04 Plans) | e2e |
| Anything else | `404.html` in the default locale, link to `/` | e2e |

Unknown paths are served `404.html` by the CDN. Its client script does the redirects above (no server, no middleware). One pure `resolvePair(market, locale, enabledPairs)` does all of it.

**Callbacks**: the path has no locale. Locale comes from stored context, else the `returnUrl` query (`market`, `locale`, which we add, 05), else the `/` rule (04 invariant 2). Query values are checked with `resolvePair`, never put into a path unchecked. Callbacks check against all known pairs, not only enabled ones, so a disabled market still renders in its locale (10, Q52). Check: unit (each source), e2e (return with storage cleared → query locale; garbage query with browser locale pinned to `en-US` → `/ee/et/`).

### String ownership

| Source | Covers | Check |
|---|---|---|
| CMS (06) | Plans only: `headline`, `subhead`, card `title`/`bullets`/`badge`, `legalText`, FAQ | unit (parse), build (06 gate) |
| Our catalog `messages/{locale}.ts`, one per locale (`et`, `lv`, `lt`, `en`) | Everything else: buttons, "/ month", trial copy, Review, every 04 state message, polling status, errors, countdown, 404, `document.title` | unit: all catalogs have the same keys, no empty value. build: catalog keys = TypeScript type |
| CMP | Consent banner (vendor, Q5) | manual |

No hardcoded user-facing string in components. Check: lint rule (`react/jsx-no-literals`, existing ESLint plugin) in `npm run lint`. Catalog copy is ours until Marketing reviews it; the 4 catalogs need translation before launch (Q48).

### Formatting

| What | How | Check |
|---|---|---|
| Money | `Intl.NumberFormat(tag, {style:'currency', currency})` on `Math.round(priceNet*(1+vatRate))/100` (Q2). `et` → `11,15 €`, `en` → `€11.15` | unit, one case per locale |
| Counts ("Try again in N s") | `Intl.PluralRules(tag)`. `lt` has `one/few/many/other`, `lv` has `zero/one/other` | unit for 0, 1, 2, 5, 11, 21 |
| Tag | `et`, `lv`, `lt`; `en` → `en-150` (`en-EE` falls back to US style) (Q48) | unit |

## Accessibility

Target WCAG 2.2 AA (Q21). Not in the brief, but the European Accessibility Act (in force since 28 June 2025) covers e-commerce and audiovisual services for consumers in the EU; it points to EN 301 549 = WCAG 2.1 AA, which 2.2 AA includes. Provider pages are out of our control.

| Expectation | Check |
|---|---|
| Every screen (Plans, Review, every 04 state, 404, both callbacks): one `<h1>`, landmarks, `lang` | axe on each screen in e2e |
| `document.title` unique per state | e2e: collect titles along the path, assert no repeats |
| Plans: each card is an `<article>` with its title as heading; select button name includes the plan ("Choose Standard"), price is one text node (no spans splitting digits and currency) | unit (price element `textContent` = formatted price, no child elements), axe |
| Step change (client-side): focus moves to the new `<h1>` (`tabindex="-1"`), title updates | unit, e2e |
| Back restore from bfcache (`pageshow` with `persisted`): same focus rule (04 invariant 6) | unit (handler on a synthetic `pageshow`), manual (Playwright may not hit bfcache) |
| Async status (Verifying, Gate, Polling, RateLimited) in one `aria-live="polite"` region. Announce only when the text changes ("Still confirming", "Connection issue"), not each poll or second. Countdown: the per-second number is outside the live region; the region gets one message at start and one when "Try again" enables | unit (live region text changes only on state change), manual |
| Before a redirect (eID, payment, `actionUrl`): button text says the user leaves the site ("Continue to eID"). On click, live region "Opening …", redirect after the GTM callback, not before 300 ms and not after 500 ms (same rule as the redirect events in 07) | unit, manual |
| Keyboard only: whole happy path with Tab/Enter/Space, no trap, Tab order = visual order | e2e (keyboard-only happy path, asserts focus sequence) |
| Visible focus: `:focus-visible` outline ≥ 2px, 3:1 against background | e2e (focused element computed `outline-width` ≥ 2px), manual (contrast) |
| Errors: blocking error in a banner that gets focus; field errors (Review consent checkbox) via `aria-invalid` + `aria-describedby` | unit, axe |
| Error copy says what happened and what to do; color is never the only signal | manual (catalog review per locale) |
| Target size: 44 × 44 px clickable area per control, label included (checkbox via its `<label>`). Links inside running text (`legalText`, FAQ answers) exempt, as 2.5.8. Stricter than 2.5.8's 24 px | e2e (bounding box of every button, standalone link, and checkbox label ≥ 44) |
| In-flight buttons: `aria-disabled` + busy text, so focus stays on them. Clicks still fire, so the handler ignores them while a request is in flight (04 double tap) | unit: two clicks → one request, focus unchanged |
| Text contrast 4.5:1 | axe |
| Control and icon contrast 3:1 | manual (axe doesn't check non-text contrast) |
| Reflow at 320 px, 200 % zoom | e2e (320 px: no horizontal scroll), manual (zoom) |
| `prefers-reduced-motion`: no spinner animation | e2e (`reducedMotion: 'reduce'`: spinner `animation-name` = `none`) |

## Performance

70 % of traffic on phones, "under two minutes" [D brief], no budgets (Q22). Budgets apply to the Plans page (entry, where most users bounce), on the Lighthouse mobile preset.

| Metric | Budget | Check |
|---|---|---|
| LCP | < 2.5 s | Lighthouse |
| CLS | < 0.1 | Lighthouse; e2e: no layout shift entry > 0 after `/v1/me` resolves |
| INP | < 200 ms. Lab proxy: TBT < 200 ms | Lighthouse (TBT). Field INP not measured (cut, PLAN.md) |
| JS | ≤ 200 KB gzip first load on Plans, our code + framework (Q54). GTM and CMP excluded here (loaded after hydration) but included in LCP, INP, CLS. Framework alone measured 174,176 B gzip at scaffold (W-01, Next 16) | build: gzip -9 sum of JS chunks referenced by the route's `out/**/index.html` (`next build` no longer prints First Load JS) |
| Flow time | `plan_viewed` → `purchase` median < 2 min | GA (after launch, 07) |

### What Plans may wait for

- **Nothing at runtime for first paint.** Headline, cards and prices are in the HTML (CMS + `/v1/plans` at build, Q23). Check: e2e with the API blocked → cards and prices visible.
- `/v1/me` runs after hydration and never blocks paint. The trial line on the Standard and Premium cards is in the HTML. When `/v1/me` says identified and not `trialEligible`, the line gets `visibility: hidden` and keeps its space (04 *Trial*), so the answer moves nothing on Plans. An active subscriber sees Plans briefly, then redirects (Q10). Check: e2e (CLS entry).
- Resume banner (open order) is a sticky overlay, not inserted above the cards. Check: e2e CLS entry.
- GTM and CMP load `afterInteractive`; the banner is an overlay, never the LCP element. Check: manual read of the Lighthouse LCP element (`<h1>` or first card).
- Fonts: system stack, or one self-hosted font with `font-display: swap` + `size-adjust`. No hero image. Check: Lighthouse.

### How SSG closes the gap

Each pair is static HTML on the CDN: low TTFB, LCP element in the first response, no client fetch before paint. The remaining cost is hydration, so Plans is a server component; only the select buttons and the flow controller are client code. Polling, Review and callbacks are their own routes, split out of the Plans bundle. Check: build (JS budget), Lighthouse.
