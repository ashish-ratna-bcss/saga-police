# Sentiment analysis flow — when a new post arrives

Live path: `backend/src/services/media_post_analysis` (started from `backend/src/index.js`).  
The older `sentimentanalysis` package is **not** the live scheduler.

---

## Flowchart

```mermaid
flowchart TD
  subgraph INGEST["1. Ingest"]
    A["Platform monitor<br/>FB / X / YT / IG / TG / Reddit"] --> B["upsertPost()"]
    B --> C{"New post or text changed?"}
    C -->|Yes| D["Set analysis_status = pending<br/>nudgeTenant(dbName)"]
    C -->|No| Z["Skip analysis"]
  end

  subgraph QUEUE["2. Queue & claim"]
    D --> E["nudge ~50ms OR poll every 30s"]
    E --> F["enqueueOldestPending<br/>oldest posted_at first, batch ≤20"]
    F --> G["In-memory fair queue<br/>per-tenant"]
    G --> H["Worker: analyzeMediaPost / analyzeEventMedia"]
    H --> I["Claim row: pending/failed → processing"]
  end

  subgraph MEDIA["3. Media enrichment"]
    I --> J{"Has video URL?"}
    J -->|Yes| K["Video analysis → image_analysis"]
    J -->|No| L{"Has image?"}
    L -->|Yes| M["OCR → image_analysis"]
    L -->|No| N["Skip media"]
    K --> O{"Need audio transcript?"}
    O -->|Still waiting| P["status=pending<br/>retry later"]
    O -->|Done / permanent fail| Q["Combine text"]
    M --> Q
    N --> Q
  end

  subgraph SENTIMENT["4. Sentiment & intelligence"]
    Q --> R["text = post + OCR/media + transcript"]
    R --> S{"Text too short?"}
    S -->|Yes| T["status = skipped"]
    S -->|No| U["Match tenant keywords<br/>Pre-map policies"]
    U --> V["intelligenceClient.analyzeText<br/>POST /analyze/intelligence"]
    V --> W{"API OK?"}
    W -->|Busy / error| X["status=pending or failed<br/>retry up to max attempts"]
    W -->|OK| Y["Build analysis_result<br/>sentiment, risk, stance, category"]
  end

  subgraph STORE["5. Persist & alerts"]
    Y --> AA["status = done<br/>save analysis_result"]
    AA --> AB{"Alert? medium/high risk,<br/>keyword match, or alert_for_every_post"}
    AB -->|Yes| AC["Upsert social_media_alerts"]
    AB -->|No| AD["Done"]
    AC --> AD
  end
```

---

## Step summary

| Step | What happens | Key files |
|------|----------------|-----------|
| 1. Ingest | Monitor upserts post; new/changed text → `pending` + `nudgeTenant` | `monitoringsocialmedia/upsertPost.js`, event scan |
| 2. Queue | Nudge (~50ms) or poll (30s) loads oldest pending/failed into fair queue | `media_post_analysis/pollPending.js`, `queue.js`, `analysisFairQueue.js` |
| 3. Media | Video analysis and/or OCR; video also waits for audio transcript | `extractOcr.js`, `extractAudio.js`, `analyzeMediaPost.js` |
| 4. Sentiment | Keywords + policy pre-map → Sentiment API | `intelligence.client.service.js`, `mapping.service.js` |
| 5. Persist | Save `analysis_result`; alert if medium/high, keywords, or every-post setting | `analyzeMediaPost.js`, `alerts/alert.service.js` |

---

## Status values

| `analysis_status` | Meaning |
|-------------------|---------|
| `pending` | Waiting (new, retry, or audio still waiting) |
| `processing` | Worker claimed the row |
| `done` | Analysis saved |
| `skipped` | Empty / too-short text |
| `failed` | Gave up after max attempts (non-busy errors) |

---

## Env knobs (defaults)

| Variable | Default | Role |
|----------|---------|------|
| `MEDIA_ANALYSIS_POLL_MS` | `30000` | Poller interval |
| `MEDIA_ANALYSIS_POLL_BATCH` | `20` | Max jobs claimed per tenant per poll |
| `MEDIA_ANALYSIS_CONCURRENCY` | `2` | Parallel workers |
| `SENTIMENT_MAX_ATTEMPTS` | `5` | Max non-busy failures before `failed` |
| `OCR_SERVICE_URL` | `http://101.53.140.97:8000` | OCR / video extract base |
| `AUDIO_TRANSCRIBER_URL` | `http://127.0.0.1:2002` | Whisper-style transcription |
| `INTELLIGENCE_SERVICE_URL` / `CUSTOM_SENTIMENT_URL` | `http://127.0.0.1:8003` | Sentiment / intelligence API |

See also root [`pipeline.md`](../pipeline.md) for the fuller architecture write-up.
