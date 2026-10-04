"""
NER microservice for Doy Fe.
Extracts personally identifiable information from legal documents
using Microsoft Presidio + spaCy + custom Argentine recognizers.
All processing is local — no data leaves this server.
"""
import os
import time
import logging

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ner-service")

API_KEY = os.environ.get("NER_API_KEY", "")

app = FastAPI(title="Doy Fe NER Service", version="1.0.0")

analyzer = None


def get_analyzer():
    global analyzer
    if analyzer is not None:
        return analyzer

    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "es", "model_name": "es_core_news_lg"}],
    })
    nlp_engine = provider.create_engine()

    analyzer = AnalyzerEngine(
        nlp_engine=nlp_engine,
        supported_languages=["es"],
    )

    from recognizers import get_custom_recognizers
    for rec in get_custom_recognizers():
        analyzer.registry.add_recognizer(rec)

    logger.info("Analyzer initialized with spaCy es_core_news_lg + custom recognizers")
    return analyzer


class AnalyzeRequest(BaseModel):
    text: str
    language: str = "es"
    score_threshold: float = 0.35


class Entity(BaseModel):
    entity_type: str
    start: int
    end: int
    score: float
    text: str


class AnalyzeResponse(BaseModel):
    entities: list[Entity]
    duration_ms: int


def check_auth(authorization: str | None):
    if not API_KEY:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or parts[1] != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health():
    eng = analyzer
    recognizers = len(eng.registry.recognizers) if eng else 0
    return {"ok": True, "engine": "presidio+spacy", "model": "es_core_news_lg", "recognizers": recognizers, "ready": eng is not None}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest, authorization: str | None = Header(None)):
    check_auth(authorization)

    if not req.text or not req.text.strip():
        return AnalyzeResponse(entities=[], duration_ms=0)

    if len(req.text) > 200_000:
        raise HTTPException(status_code=413, detail="Text too large (max 200KB)")

    t0 = time.time()
    eng = get_analyzer()

    results = eng.analyze(
        text=req.text,
        language=req.language,
        score_threshold=req.score_threshold,
        entities=[
            "PERSON", "LOCATION", "NRP",
            "AR_DNI", "AR_CUIT", "AR_MATRICULA", "AR_PARTIDA", "AR_DOMICILIO",
            "EMAIL_ADDRESS", "PHONE_NUMBER",
        ],
    )

    merged = merge_overlapping(results)

    entities = []
    for r in merged:
        entities.append(Entity(
            entity_type=r.entity_type,
            start=r.start,
            end=r.end,
            score=r.score,
            text=req.text[r.start:r.end],
        ))

    duration_ms = int((time.time() - t0) * 1000)
    logger.info(f"Analyzed {len(req.text)} chars -> {len(entities)} entities in {duration_ms}ms")

    return AnalyzeResponse(entities=entities, duration_ms=duration_ms)


def merge_overlapping(results):
    """When multiple recognizers detect overlapping spans, keep the highest-scoring one."""
    if not results:
        return []
    sorted_results = sorted(results, key=lambda r: (r.start, -r.end, -r.score))
    merged = [sorted_results[0]]
    for r in sorted_results[1:]:
        prev = merged[-1]
        if r.start < prev.end:
            if r.score > prev.score:
                merged[-1] = r
        else:
            merged.append(r)
    return merged


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
