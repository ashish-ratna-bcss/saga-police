# Media & Sentiment Analysis Pipeline Architecture

This document describes the end-to-end processing pipeline for social media posts and event media within Blurasaga.

---

## 1. High-Level Flowchart

```mermaid
flowchart TD
    %% Styling
    classDef server fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef gpu fill:#14532d,stroke:#22c55e,stroke-width:2px,color:#fff;
    classDef db fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef ai fill:#701a75,stroke:#d946ef,stroke-width:2px,color:#fff;
    classDef step fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#e2e8f0;

    subgraph INGESTION["1. Poller & Job Dispatcher (Saga Server)"]
        A["pollPending.js (Every 30s)"]:::server
        B{"Has Pending Posts / Event Media?"}:::step
        C["In-Memory Queue (queue.js)<br/>Concurrency: 2 workers"]:::server
        A --> B
        B -- Yes --> C
    end

    subgraph OCR_PIPELINE["2. Image OCR Extraction (ACB Server)"]
        D{"Contains Image Media?"}:::step
        E["Download Image & Convert to Base64"]:::step
        F["POST http://98.86.63.69:8000/extract<br/>(NVIDIA A10G GPU)"]:::gpu
        G["Full OCR Response:<br/>• full_text<br/>• bounding_boxes<br/>• confidence, language"]:::step
        H["Save image_analysis in DB<br/>(Post text remains clean description)"]:::step

        C --> D
        D -- "Image Found" --> E
        E --> F
        F --> G
        G --> H
        D -- "Text Only / Video" --> I["Skip OCR (ocrData = null)"]:::step
    end

    subgraph PRE_SENTIMENT["3. Pre-Mapping & Enrichment"]
        J[("Tenant DB")]:::db
        K[("Main DB (blurasaga)")]:::db
        
        L["Match Custom Keywords<br/>(Tenant DB: keywords table)"]:::step
        M["Combine Platform & Legal Policies:<br/>1. Default Policies (Main DB)<br/>2. Tenant Custom Policies (Tenant DB)"]:::step
        N["Infer Initial Category & Pre-Map<br/>(mapping.service.js)"]:::step

        H --> L
        I --> L
        J -.->|"Fetch Custom Keywords"| L
        K -.->|"Fetch Default Policies"| M
        J -.->|"Fetch Tenant Overrides"| M
        L --> M
        M --> N
    end

    subgraph SENTIMENT_API["4. Intelligence & Sentiment Analysis"]
        O["intelligenceClient.analyzeText()"]:::ai
        P["Payload to Sentiment API (Port 8003):<br/>{<br/>  texts: [post_text],<br/>  image_analysis: ocrData,<br/>  keywords: matchedKeywords,<br/>  policy: combinedPolicy<br/>}"]:::ai
        Q["Custom Sentiment API<br/>(LLM / vLLM Models)"]:::ai
        R["Analysis Result:<br/>• sentiment (positive/negative/neutral)<br/>• risk_score (0-100)<br/>• intent & categories"]:::step

        N --> O
        O --> P
        P --> Q
        Q --> R
    end

    subgraph PERSISTENCE["5. Result Storage & Alerts"]
        S["Evaluate Risk Score vs Thresholds<br/>(high / medium)"]:::step
        T{"Is Risk Above Alert Threshold?"}:::step
        U["Create Record in social_media_alerts"]:::step
        V["Update social_media_posts / event_media:<br/>• analysis_status = 'done'<br/>• analysis_result = JSON<br/>• image_analysis = ocrData<br/>• analyzed_at = NOW()"]:::db

        R --> S
        S --> T
        T -- Yes --> U
        T -- No --> V
        U --> V
    end
```

---

## 2. Detailed Pipeline Steps

### Step 1: Scheduling & Queue Dispatch
* **Component**: `src/services/media_post_analysis/pollPending.js` & `queue.js`
* **Schedule**: Background poller polls every 30 seconds for records where `analysis_status` is `pending` or `failed` (attempts < max).
* **Concurrency**: Managed by an in-memory queue with concurrency limits to prevent upstream API starvation.

### Step 2: GPU-Accelerated Image OCR
* **Component**: `src/services/media_post_analysis/extractOcr.js`
* **Target Server**: `acb` (`http://98.86.63.69:8000/extract`) running on an **NVIDIA A10G GPU**.
* **Behavior**:
  * Images are downloaded into memory and converted to Base64.
  * Sent to the OCR service which extracts detected text, bounding boxes, language, and confidence scores.
  * The full OCR response is retained in `image_analysis`.
  * The post's original description/text is kept intact (OCR is not appended into `post.text`).

### Step 3: Keywords & Combined Policy Resolution
* **Components**: `src/services/media_post_analysis/analyzeMediaPost.js`, `analyzeEventMedia.js`, and `src/modules/settings/mapping.service.js`
* **Custom Keywords**:
  * Scoped strictly to the tenant's custom keyword database (`keywords` table).
  * Text is matched against active keywords with case-insensitive tokenization.
* **Unified Policy Merging**:
  * **Default Policies**: Fetched from the global database (`default_policies` in `blurasaga`).
  * **Tenant Policies**: Fetched from the tenant's `policy_mappings` table.
  * The mapping engine merges both sources so standard platform rules and custom department policies are simultaneously considered.

### Step 4: Sentiment & Intelligence Call
* **Component**: `src/modules/intelligence/intelligence.client.service.js`
* **Target Server**: Sentiment API (`CUSTOM_SENTIMENT_URL`, port 8003)
* **Payload Structure**:
```json
{
  "texts": ["Full post content including image text..."],
  "image_analysis": {
    "full_text": "...",
    "bounding_boxes": [...],
    "language": "en"
  },
  "keywords": [
    { "keyword": "...", "weight": 50, "category": "other" }
  ],
  "policy": {
    "category_id": "Defamation",
    "platform_policies": [...],
    "legal_sections": [...]
  }
}
```

### Step 5: Database Persistence & Alerts
* **Components**: `social_media_posts`, `social_media_event_media`, `social_media_alerts`
* **Actions**:
  * Updates record with `analysis_status: 'done'`, `analysis_result`, `image_analysis`, and timestamp.
  * Evaluates computed `risk_score` against high and medium risk thresholds.
  * Automatically creates an alert in `social_media_alerts` if the risk threshold is met.
