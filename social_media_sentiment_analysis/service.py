"""HTTP wrapper around the finalized production pipeline (IndicTrans2 -> Cardiff
Twitter RoBERTa), so SOCKEYE's Node backend can use it as an alternative
sentiment engine (SENTIMENT_ANALYSIS=CUSTOM).

Does not change predict.py / run.py / src/* — this only adds a thin FastAPI
layer around src.pipeline.SentimentPipeline, loaded once at startup.

Run:
    uvicorn service:app --host 0.0.0.0 --port 8003
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import config
from src.utils import setup_logging

setup_logging(logging.INFO)
logger = logging.getLogger("sentiment_service")

app = FastAPI(title="Social Media Sentiment Analysis", version="1.0.0")

_pipeline = None  # lazy singleton — loaded on startup, reused across requests


class AnalyzeRequest(BaseModel):
    texts: list[str]


@app.on_event("startup")
def _load_pipeline():
    global _pipeline
    from src.pipeline import SentimentPipeline

    logger.info("Loading sentiment pipeline (IndicTrans2 + Cardiff RoBERTa)...")
    _pipeline = SentimentPipeline()
    logger.info("Sentiment pipeline ready.")


@app.get("/health")
def health():
    return {"status": "ok" if _pipeline is not None else "loading"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if _pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline still loading")
    if not req.texts:
        return {"results": []}

    results = _pipeline.predict_batch(req.texts)
    return {"results": [r.to_dict() for r in results]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8003)))
