# Async File Processing Architecture

This document describes the async file processing integration with Redis-based distributed task queue.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                         │
│                                                                             │
│  1. POST /api/upload ─────► 2. 202 Accepted (jobId, statusUrl)              │
│                                                                             │
│  3. GET /api/files/{id}/status ─────► { status, progress, ... }             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RAG API SERVER                                    │
│                          (Node.js/Express)                                  │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │  Upload     │───►│  MongoDB    │    │  queueService.enqueueJob()      │  │
│  │  Route      │    │  (QUEUED)   │───►│  ─────────────────────────────  │  │
│  └─────────────┘    └─────────────┘    │  Adds job to Redis queue        │  │
│                                         └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REDIS                                          │
│                          (Job Queue)                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  queue:cpu  [job1, job2, ...]  (Priority Sorted Set)                │    │
│  │  queue:gpu  [job3, ...]        (Priority Sorted Set)                │    │
│  │  job:{id}   { payload, status, progress, ... }  (Hash)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  FILE WORKER 1    │   │  FILE WORKER 2    │   │  GO WORKER        │
│  (Node.js)        │   │  (Node.js)        │   │  (Optional)       │
│                   │   │                   │   │                   │
│  - Claim job      │   │  - Claim job      │   │  - Claim job      │
│  - Extract text   │   │  - Extract text   │   │  - Process        │
│  - Chunk          │   │  - Chunk          │   │                   │
│  - Embeddings     │   │  - Embeddings     │   │                   │
│  - Store Qdrant   │   │  - Store Qdrant   │   │                   │
│  - Update Mongo   │   │  - Update Mongo   │   │                   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             QDRANT                                          │
│                       (Vector Database)                                     │
│                                                                             │
│  Stores embeddings for semantic search                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Request Flow

### Before (Synchronous)
```
POST /api/upload
    → Extract text (5-30 seconds)
    → Chunk text
    → Generate embeddings
    → Store in Qdrant
    → 200 OK

Total time: 5-30+ seconds (timeout prone)
```

### After (Asynchronous)
```
POST /api/upload
    → Save file metadata to MongoDB (status: QUEUED)
    → Enqueue job to Redis
    → 202 Accepted { fileId, jobId, statusUrl }

Total time: < 200ms ✓

[Background Worker]
    → Claim job from Redis
    → Extract text
    → Chunk text  
    → Generate embeddings
    → Store in Qdrant
    → Update MongoDB (status: COMPLETED)

Client polls: GET /api/files/{id}/status
    → { status: "PROCESSING", progress: 45 }
    → { status: "COMPLETED", chunksProcessed: 27 }
```

## Quick Start

### 1. Start Dependencies
```bash
# Start Redis and Qdrant
docker-compose up -d redis qdrant
```

### 2. Start API Server
```bash
npm start
```

### 3. Start Worker(s)
```bash
# Terminal 1 - Worker 1
node workers/fileProcessor.js

# Terminal 2 - Worker 2 (optional, for more throughput)
WORKER_ID=file-worker-2 node workers/fileProcessor.js
```

### 4. Test Upload
```bash
# Upload file (returns immediately)
curl -X POST -F "file=@test.pdf" http://localhost:5000/api/upload \
  -H "Authorization: Bearer <token>"

# Response:
# {
#   "fileId": "...",
#   "jobId": "...",
#   "status": "QUEUED",
#   "statusUrl": "/api/files/{fileId}/status"
# }

# Check status (poll until COMPLETED)
curl http://localhost:5000/api/files/{fileId}/status \
  -H "Authorization: Bearer <token>"

# Response:
# {
#   "status": "PROCESSING",
#   "progress": 45,
#   "totalChunks": 27,
#   "chunksProcessed": 12
# }
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Async file upload (returns 202 immediately) |
| `/api/upload/sync` | POST | Sync file upload (waits for completion) |
| `/api/files/:id/status` | GET | Check file processing status |
| `/api/files` | GET | List all files |
| `/api/files/:id` | GET | Get file details |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | localhost | Redis server host |
| `REDIS_PORT` | 6379 | Redis server port |
| `WORKER_ID` | file-worker-{pid} | Unique worker identifier |
| `WORKER_TYPE` | cpu | Worker type (cpu/gpu) |
| `POLL_INTERVAL_MS` | 1000 | Queue polling interval |
| `HEARTBEAT_INTERVAL_MS` | 5000 | Job heartbeat interval |

## File Structure

```
├── routes/
│   └── fileRoutes.js       # Async upload + status endpoint
├── workers/
│   └── fileProcessor.js    # Background file processor
├── utils/
│   ├── queueService.js     # Redis queue integration
│   ├── textExtractor.js    # Text extraction (unchanged)
│   ├── chunking.js         # Text chunking (unchanged)
│   ├── embeddingService.js # Embeddings (unchanged)
│   └── qdrantService.js    # Vector DB (unchanged)
├── models/
│   └── File.js             # Updated with status fields
├── docker-compose.yml      # Redis + workers
└── Dockerfile.worker       # Worker container
```
