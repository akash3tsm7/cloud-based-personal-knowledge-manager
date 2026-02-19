from fastapi import FastAPI
from FlagEmbedding import BGEM3FlagModel
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI()

# ----------- Request Models -----------

class EmbedRequest(BaseModel):
    text: str

class EmbedBatchRequest(BaseModel):
    texts: List[str]

# ----------- Load Model Once -----------

print("🔄 Loading BGE-M3 model... (first run may take time)")
model = BGEM3FlagModel(
    "BAAI/bge-m3",
    use_fp16=True
)
EMBEDDING_DIM = 1024
print("✅ BGE-M3 model loaded")

# ----------- Redis Cache Setup -----------

import redis
import hashlib
import pickle
import os

# Connect to Redis (use docker service name or localhost)
redis_host = os.getenv('REDIS_HOST', 'redis')
redis_port = int(os.getenv('REDIS_PORT', 6379))

try:
    cache = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=False)
    cache.ping()
    print(f"✅ Redis cache connected at {redis_host}:{redis_port}")
    CACHE_ENABLED = True
except Exception as e:
    print(f"⚠️  Redis cache unavailable: {e}")
    cache = None
    CACHE_ENABLED = False

CACHE_TTL = 3600  # 1 hour

def get_cache_key(text: str) -> str:
    """Generate MD5 hash for cache key"""
    return f"emb:{hashlib.md5(text.encode('utf-8')).hexdigest()}"

def get_cached_embedding(text: str):
    """Retrieve embedding from cache"""
    if not CACHE_ENABLED or not cache:
        return None
    try:
        key = get_cache_key(text)
        cached = cache.get(key)
        if cached:
            return pickle.loads(cached)
    except Exception as e:
        print(f"Cache read error: {e}")
    return None

def cache_embedding(text: str, embedding):
    """Store embedding in cache with TTL"""
    if not CACHE_ENABLED or not cache:
        return
    try:
        key = get_cache_key(text)
        cache.setex(key, CACHE_TTL, pickle.dumps(embedding))
    except Exception as e:
        print(f"Cache write error: {e}")

# ----------- Single Embed -----------

@app.post("/embed")
async def embed(data: EmbedRequest):
    text = data.text.strip() if data.text else ""

    if not text:
        return {"embedding": None}

    # Check cache first
    cached = get_cached_embedding(text)
    if cached is not None:
        return {"embedding": cached, "cached": True}

    # Generate embedding
    vec = model.encode(
        [text],
        batch_size=1,
        max_length=8192
    )["dense_vecs"][0]

    if vec is None or len(vec) != EMBEDDING_DIM:
        return {"embedding": None}

    embedding = vec.tolist()
    
    # Cache the result
    cache_embedding(text, embedding)

    return {"embedding": embedding, "cached": False}

# ----------- Batch Embed -----------

@app.post("/embed/batch")
async def embed_batch(data: EmbedBatchRequest):
    if not data.texts:
        return {"embeddings": []}

    # Preserve order, replace empty text with space
    cleaned_texts = [
        t.strip() if isinstance(t, str) and t.strip() else " "
        for t in data.texts
    ]

    # Check cache for each text
    results = []
    texts_to_generate = []
    indices_to_generate = []
    
    for i, text in enumerate(cleaned_texts):
        cached = get_cached_embedding(text)
        if cached is not None:
            results.append(cached)
        else:
            results.append(None)  # Placeholder
            texts_to_generate.append(text)
            indices_to_generate.append(i)

    # Generate embeddings for cache misses
    if texts_to_generate:
        vectors = model.encode(
            texts_to_generate,
            batch_size=12,
            max_length=8192
        )["dense_vecs"]

        # Fill in results and cache new embeddings
        for idx, vec in zip(indices_to_generate, vectors):
            if vec is not None and len(vec) == EMBEDDING_DIM:
                embedding = vec.tolist()
                results[idx] = embedding
                cache_embedding(cleaned_texts[idx], embedding)

    return {"embeddings": results}

# ----------- Health Check -----------

@app.get("/health")
@app.head("/health")
async def health():
    return {
        "status": "healthy",
        "model": "BAAI/bge-m3",
        "dim": EMBEDDING_DIM
    }

# ----------- Entrypoint -----------

if __name__ == "__main__":
    print("🚀 Embedding service running on :8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)
