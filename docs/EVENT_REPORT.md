# Event intelligence report

One report per event: the full report with the evidence annex. It is written by the model from the posts, checked by code, edited and approved by a person, then printed as a PDF.

## How it is made
1. **Facts (code).** Each post is read for place, date, organiser, call to act and violence; every value is checked against the post text. Posts are split into *in the event region* and *outside it* (`eventIntelligenceReport/scope.js`). The headline numbers (tone, platforms, interactions, risk, timeline) describe the in-region posts. The monitor-wide total is shown only as "N in region of M monitored".
2. **Analysis (model).** Bottom line, issue strands (who is behind each story, what they ask, where it stands), what is known and not known, narratives to watch, actions. Post numbers the model invents are dropped.
3. **Automatic checks (`quality.js`).** Cited posts exist, claims have a source, no boilerplate or generic actions, counts agree, most evidence is in the region.
4. **Review (`review.js`, screen: Events > Summary > Review).** A person edits the text and approves. Edits are stored with the saved summary (`stats.review`) and printed on top of the generated text. Until approved the PDF carries a DRAFT mark. Regenerating the report starts a new draft (version + 1); the history keeps what was replaced.

## Tenant settings (force profile)
Stored in the tenant's `users.application_details.force_profile`. Text fields: `force`, `display_name`, `head`, `headquarters`, `pin`, `phone`, `report_language`, `timezone` (default `Asia/Kolkata`), `classification` (printed top right, e.g. `RESTRICTED`), `units` (comma separated unit names the actions may name), `signoff` (up to three sign-off roles, comma separated).
Existing tenants: `node scripts/seed-force-profiles.js --merge --apply` adds the settings they lack and never overwrites a saved value.

## API (all under `/events/:id/summary-llm`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/report.pdf` | The PDF. Header `X-Report-Status: draft or approved`. |
| GET | `/review` | Review state, automatic checks, generated and current text. |
| PUT | `/review` | Save edits `{ edits: { bottomLine, issueLink, strands, known, notKnown, actions } }`. Returns the report to draft. |
| POST | `/review/approve` | Approve. `{ acknowledge: [codes] }` for checks of level `error` that the reviewer has checked. 409 with `issues` otherwise. |
| POST | `/review/reopen` | Back to draft, keeping the edits. |

## Translation
Fixed wording is in `eventIntelligenceReport/i18n/en.json`. A language is translated once by the model and saved in `config/i18n/<language>.json`; labels added later are translated and merged on the next report. `{placeholders}` must survive translation or that label stays English.

## Checking it
- `npm test` or `node --test tests/eventReport.test.js`
- `node scripts/verify-event-report.js [posts]` renders real PDFs for four tenants (English, Hindi labels, Odia and Hindi text, draft and approved) for an event of N posts (default 400) and reports pages and time.

## Settings by environment
`REPORT_PDF_CONCURRENCY` (default 2 renders at once), `REPORT_PDF_TIMEOUT_MS` (default 180000), `DEFAULT_REPORT_TIMEZONE` (default `Asia/Kolkata`, used for new tenants).
