# Postgres Schema (SOC-EYE)

Optimized PostgreSQL target schema for migrating from MongoDB.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Full DDL in one file (enums, tables, FKs, indexes) — 48 tables |
| `backend/prisma/schema.prisma` | Prisma models (introspected from this DDL) |
| `backend/prisma/client.js` | Shared PrismaClient singleton |
| `backend/prisma/ensureSchema.js` | Dev schema ensure (`npm run db:ensure`) |

## Apply

```bash
# 1) Create empty DB, then apply DDL
psql "$DATABASE_URL" -f postgres-schema/schema.sql

# 2) From backend/: generate client (after schema changes / db pull)
cd backend && npm run prisma:generate
```

Or from `backend/`: `npm run db:apply-schema` (uses `DATABASE_URL`).

Use on an **empty** database (or drop conflicting objects first). Wrapped in `BEGIN` / `COMMIT`.

## Prisma

- Source of truth for DDL remains `schema.sql` (roles table + `users.role_id`).
- Auth modules: `backend/src/modules/{auth,user,role}` — flat `/api/login`, `/api/me`, `/api/users`, `/api/roles`.
- After editing SQL: `npm run prisma:pull && npm run prisma:generate` (or `prisma db push` in dev).

## Design rules

### Columns (typed)
Use when you filter, sort, join, unique-constrain, or need FK integrity:
- `platform`, `status`, `risk_level`, dates, handles, scores
- Grievance workflow: `workflow_status`, `classification`, author/content hot fields
- Dial100 / daily programmes: operational columns matching Mongo models
- `alert_thresholds`: one row per `platform` + `time_window_minutes`

### JSONB
Use for flexible / platform-varying payloads:
- `media`, `raw_data`, LLM blobs, settings trees, snapshots
- Grievance nests (`complaint`, `criticism`, `context`, workflows, etc.)
- Rarely filtered nested objects

**Rule:** never put a frequently filtered field only inside JSONB — promote it to a column + index.

### Primary keys
- `SERIAL` — smaller / config tables
- `BIGSERIAL` — high-volume tables (`contents`, `alerts`, `analyses`, `grievances`, …)
- Natural uniques remain (`platform` + `content_id`, `email`, etc.)
- Sparse uniques use partial indexes (`WHERE col IS NOT NULL`)

### Locality
Generic fields (`relevance_score`, `relevance_priority`, `is_locality_related`) — not state-hardcoded names — so AP / other jurisdictions can reuse the same DB shape.

## Maintenance

1. API payload shape changes → prefer JSONB updates (no DDL)
2. New filters / reports → add typed columns + indexes in `schema.sql`
3. Naming: `snake_case` tables and columns
4. Keep Prisma in sync via `prisma db pull` after SQL changes
