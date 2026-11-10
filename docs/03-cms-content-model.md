# C. CMS content model (headless CMS)

Content type **PlanPage**, one entry per market and language.

| Field | Type | Notes |
| --- | --- | --- |
| `headline`, `subhead` | Short text | Localised |
| `planCards[]` | List | Each has `planKey` (`basic`, `standard`, `premium`), `title`, `bullets[]`, `badge` and `priceLabel` |
| `priceLabel` | Short text | Free text, for example "from 7,99 € / month" |
| `legalText` | Rich text | Terms, withdrawal right and trial conditions |
| `faq[]` | List | Question and answer pairs |

The site is statically generated at deploy time and served from a CDN. A CMS publish triggers a rebuild. The Latvian entries exist but are partly empty.

Sample entries for every available market and language are in `fixtures/cms/` and are also served by the mock server at `GET /cms/v1/plan-pages?market=EE&locale=et`.
