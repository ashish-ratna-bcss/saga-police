# Event terms endpoints (used by Blurasaga)

Upstream: **Event Keyword & Hashtag Generator**  
Base URL: `http://127.0.0.1:2001` (env: `EVENT_HASHTAG_GENERATOR_URL`)

Blurasaga uses **only these two** upstream APIs:

| Upstream | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `POST /event-terms` | Generate **hashtags + keywords** |

App proxy: `POST /api/events/generate-event-terms` → upstream `POST /event-terms`.

---

## 1. `GET /health`

```bash
curl -s http://127.0.0.1:2001/health
```

```json
{
  "status": "ok",
  "service": "event-keyword-hashtag-search",
  "version": "1.0.0"
}
```

---

## 2. `POST /event-terms`

### Request

```json
{
  "event": "CJP Demand - Education Minister's Resignation",
  "location": "Odisha",
  "description": "Campaign demanding resignation over textbook / education issues.",
  "include_social": false,
  "search_engine": "all",
  "max_hashtags": 30,
  "max_keywords": 30
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `event` | yes | Event name / topic |
| `location` | yes | Place / state |
| `description` | yes | Short context |
| `include_social` | no | default `false` |
| `search_engine` | no | default `"all"` |
| `max_hashtags` | no | cap hashtag list |
| `max_keywords` | no | cap keyword list |

### Success — `200`

```json
{
  "hashtags": ["#OdishaEducation", "#SchoolThikKaro", "#NityanandaGond"],
  "keywords": ["odisha education protest", "school thik karo", "textbook errors"]
}
```

### Errors

| Status | Meaning |
|--------|---------|
| `400` | Blank `event` / `location` / `description` |
| `502` | Wigolo search failed |
| `500` | Processing failed |

### App proxy (Create Event → Add keywords)

```bash
curl -s -X POST https://odisha.blurasaga.com/api/events/generate-event-terms \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"event":"Technology Conference","location":"Hyderabad","description":"AI conference"}'
```

---

## Create Event UI flow

1. Fill **Event Name**, **Location**, **Description**.
2. Click **Add keywords**.
3. App → `POST /api/events/generate-event-terms` → upstream `POST /event-terms`.
4. Preview hashtags + keywords → **Accept** / **Decline** / **Fetch again**.

Expect **20–90 seconds** per generate call.
