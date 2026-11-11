# 06 · CMS contract

The `PlanPage` entry as the frontend uses it. Feeds the Plans state in `04-user-flow-state-machine.md`; prices come from `05-api-contract.md`. Q-numbers refer to `03-open-questions.md`.

Field marks: **[D]** in `docs/03-cms-content-model.md` · **[F]** fixtures/mock only, an assumption until CMS confirms · **[A]** our rule.

## Transport

- Fetched **at build only** [D]. A CMS publish triggers a rebuild [D]. No runtime CMS call.
- Mock: `GET /cms/v1/plan-pages?market=EE&locale=et` [F]. `market` uppercase, `locale` lowercase. 404 when the pair has no entry [F].
- Pairs: local language + `en` per market (Q24): `EE/et`, `EE/en`, `LT/lt`, `LT/en`, `LV/lv`, `LV/en`.
- One pure module `parsePlanPage(raw, apiPlans, { marketEnabled })` → `{ page, warnings }` or throws `CmsValidationError`. Unit-tested against all 6 fixtures. Components never read the raw entry.

## Build gate

| Market state | Error (404, invalid JSON, wrong type, required field empty, any rule below marked "build fails") | Warning |
|---|---|---|
| Enabled (`EE`, `LT`; `LV` with `market.LV` on) | Build fails | Logged, build continues |
| Disabled (`LV` with `market.LV` off, default) | Pages not generated. Validation still runs; errors logged as warnings | Logged |

"Empty" = missing, `null`, `""` or whitespace only, `[]`. Checked after trimming, and after dropping empty items. No fallback to another language (Q13).

Wrong type (e.g. `headline` not a string, `bullets` not an array of strings, `planCards` not an array) = error, even on optional fields. Unknown fields anywhere are ignored [A].

## Fields

| Field | Docs | Fixtures | Rule |
|---|---|---|---|
| `id`, `updatedAt` | — | present | Ignored [F] |
| `market`, `locale` | — | match the file | Must equal the requested pair, else build fails [A] |
| `headline` | short text | all filled | **Required.** Page `<h1>` (Q44) |
| `subhead` | short text | all filled | Optional. Empty → not rendered |
| `planCards[]` | list | 3 cards each | See *Card merge* |
| `planCards[].planKey` | `basic`/`standard`/`premium` | same | Join key to API plan via the map below (Q11) |
| `planCards[].title` | — | LV.lv Premium `""` | **Required** on a rendered card (Q44). API `name` is never used |
| `planCards[].bullets[]` | — | LV.en Premium, LV.lv Standard/Premium `[]` | Optional. Empty items dropped + warning. Nothing left → no list |
| `planCards[].badge` | — | `""` = no badge | Optional. Empty → no badge |
| `planCards[].priceLabel` | free text | see below | **Never rendered, never parsed** (Q2) |
| top-level `priceLabel` | short text | absent | Ignored. Docs list it, fixtures don't have it |
| `legalText` | rich text, no schema | `[{type:'paragraph', text}]`; LV `[]` | **Required.** See *legalText* |
| `faq[]` | Q&A pairs | `{question, answer}`; LV `[]` | Optional. A pair with an empty side is dropped + warning. Nothing left → section hidden |

All strings are plain text, rendered through React escaping. No HTML or Markdown parsing. Line breaks inside a string are not preserved [A].

## planKey ↔ planId (Q11)

One map in app config, used by the merge and by `returnUrl` encoding (`plan` param = `planKey`).

| `planKey` | API `id` | Trial (Q12) |
|---|---|---|
| `basic` | `plan_basic_m` | no |
| `standard` | `plan_std_m` | 30 days, if `trialEligible` |
| `premium` | `plan_prem_m` | 30 days, if `trialEligible` |

Trial copy comes from our per-locale dictionary, not the CMS. CMS has no trial field.

## Card merge

Input: CMS `planCards[]` + API `plans[]` for the market (fetched at build, Q23). Plans fetch fails or returns no plans → build fails [A].

1. Card `planKey` not in the map → card dropped + warning.
2. Duplicate `planKey` in one entry → build fails [A].
3. Card with no matching API plan → hidden, no error (Q8).
4. API plan with no CMS card → build fails for an enabled market (Q45).
5. Rendered card with empty `title` → build fails (Q44).
6. Order = CMS array order (Q44). Price = `Math.round(priceNet * (1 + vatRate))`, `Intl.NumberFormat(locale, {style:'currency', currency})` (Q2).

## legalText (Q25)

- Node `{type:'paragraph', text}` → `<p>`. Empty `text` → skipped. Other node fields (future marks) ignored.
- Any other `type`, or a non-object node → skipped + warning.
- No paragraph left → required-field failure (see *Build gate*).
- Rendered as-is on Plans and Review, for every user. Its trial sentence is legal terms, not an eligibility claim.

## priceLabel vs API (why it's never shown)

API gross price vs CMS `priceLabel`. All CMS labels also say "from", but the price is flat.

| Market | Basic | Standard | Premium |
|---|---|---|---|
| EE (24%) | 7,43 = 7,43 | **11,15 ≠ 10,99** | 16,11 = 16,11 |
| LT (21%) | 7,25 = 7,25 | 10,88 = 10,88 | **15,72 ≠ 14,99** |
| LV (21%) | 7,25 = 7,25 | 10,88 = 10,88 | no API plan; label `""` |

## Outcome per fixture

| Fixture | `market.LV` off | `market.LV` on |
|---|---|---|
| EE.en, EE.et, LT.en, LT.lt | Valid. 3 cards; badge on Standard only; 2 legal paragraphs; 2 FAQ | same |
| LV.en | Not generated; warning "legalText empty" | **Build fails**: `legalText` empty. Once fixed: Basic + Standard (with badge), Premium hidden, FAQ hidden |
| LV.lv | Not generated; warning "legalText empty" | **Build fails**: `legalText` empty. Once fixed: Basic + Standard (no bullets, no badge), Premium hidden (its empty title is never checked), FAQ hidden |

## Requests to CMS team

1. **Publish validation** for required fields (`headline`, card `title`, `legalText`), so an empty entry can't reach the build (Q13, Q44).
2. **`legalText` schema**: allowed node types, links, marks (Q25).
3. **Fill LV entries** before LV launch: `legalText`, FAQ, LV.lv Standard bullets (Q13).
4. **Document `planKey`** values and who owns adding a plan (Q11, Q45).
