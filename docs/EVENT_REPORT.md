# Event intelligence report

One report per event: the full report with the evidence annex. It is written by the model from the posts and checked by code, then printed as a PDF.

## How it is made
1. **Facts (code).** Each post is read for place, date, organiser, call to act and violence; every value is checked against the post text. Posts are split into *in the event region* and *outside it* (`eventIntelligenceReport/scope.js`). The headline numbers (tone, platforms, interactions, risk, timeline) describe the in-region posts. The monitor-wide total is shown only as "N in region of M monitored".
2. **Analysis (model).** Bottom line, issue strands (who is behind each story, what they ask, where it stands), what is known and not known, narratives to watch, actions. Post numbers the model invents are dropped.

## Tenant settings (force profile)
Stored in the tenant's `users.application_details.force_profile`. Text fields: `force`, `display_name`, `head`, `headquarters`, `pin`, `phone`, `report_language`, `timezone` (default `Asia/Kolkata`), `classification` (printed top right, e.g. `RESTRICTED`), `units` (comma separated unit names the actions may name), `signoff` (up to three sign-off roles, comma separated).
Existing tenants: `node scripts/seed-force-profiles.js --merge --apply` adds the settings they lack and never overwrites a saved value.

## API
`GET /events/:id/summary-llm/report.pdf` returns the PDF.

## Translation
Fixed wording is in `eventIntelligenceReport/i18n/en.json`. A language is translated once by the model and saved in `config/i18n/<language>.json`; labels added later are translated and merged on the next report. `{placeholders}` must survive translation or that label stays English.

## Checking it
- `npm test` or `node --test tests/eventReport.test.js`
- `node scripts/verify-event-report.js [posts]` renders real PDFs for four tenants (English, Hindi labels, Odia and Hindi text) for an event of N posts (default 400) and reports pages and time.

## Settings by environment
`REPORT_PDF_CONCURRENCY` (default 2 renders at once), `REPORT_PDF_TIMEOUT_MS` (default 180000), `DEFAULT_REPORT_TIMEZONE` (default `Asia/Kolkata`, used for new tenants).
