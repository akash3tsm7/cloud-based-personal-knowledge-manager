# Performance Testing Suite

This directory contains all performance testing, benchmarking, load testing, and capacity planning tools for the Cloud-Based Personal Knowledge Manager.

## Directory Structure

```
performance/
├── benchmarks/           # Performance benchmarks
│   ├── embedding-benchmark.js
│   ├── qdrant-benchmark.js
│   ├── rag-benchmark.js
│   └── run-all-benchmarks.js
├── load-tests/          # Load testing scripts
│   ├── artillery-config.yml
│   ├── load-test-processor.js
│   ├── rag-load-test.js
│   └── run-all-tests.js
├── capacity/            # Capacity planning tools
│   └── capacity-analysis.js
├── utils/               # Shared utilities
│   ├── metrics-collector.js
│   ├── performance-logger.js
│   └── test-data-generator.js
├── reports/             # Generated reports (gitignored)
├── logs/                # Performance logs (gitignored)
└── test-data/           # Test data files (gitignored)
```

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Ensure server is running for load tests
npm start
```

### Running Benchmarks

```bash
# Run all benchmarks
npm run benchmark

# Run individual benchmarks
node performance/benchmarks/embedding-benchmark.js
node performance/benchmarks/qdrant-benchmark.js
node performance/benchmarks/rag-benchmark.js
```

**What it does:**
- Tests embedding generation performance
- Benchmarks Qdrant vector operations
- Measures RAG query end-to-end latency
- Generates detailed performance reports

**Output:** `performance/reports/*-benchmark-results.json`

### Running Load Tests

```bash
# Run all load tests
npm run load-test

# Run individual load tests
node performance/load-tests/rag-load-test.js

# Run Artillery load tests
artillery run performance/load-tests/artillery-config.yml
```

**What it does:**
- Simulates concurrent users
- Tests system under various load conditions
- Measures throughput and latency under stress
- Identifies breaking points

**Output:** `performance/reports/*-load-test-results.json`

### Running Capacity Analysis

```bash
# Run capacity planning analysis
npm run capacity-analysis
```

**What it does:**
- Calculates storage requirements per user
- Estimates memory and CPU capacity
- Projects scaling needs for user growth
- Generates cost estimates

**Output:** `performance/reports/capacity-analysis.json`

### Generating Performance Reports

```bash
# Generate comprehensive performance report
npm run performance-report
```

**Output:** HTML/PDF performance report with charts

## Performance Monitoring

### Real-Time Metrics API

The application exposes performance metrics through REST API:

```bash
# Health check
GET /api/performance/health

# Current metrics
GET /api/performance/metrics
Authorization: Bearer <token>

# Performance logs
GET /api/performance/logs?date=2026-01-20
Authorization: Bearer <token>

# Aggregated statistics
GET /api/performance/stats
Authorization: Bearer <token>

# Export metrics
GET /api/performance/export
Authorization: Bearer <token>

# Reset metrics
POST /api/performance/reset
Authorization: Bearer <token>
```

### Metrics Collected

- **Request Metrics:** Total, successful, failed, by endpoint
- **Latency Metrics:** p50, p95, p99, avg, min, max
- **Throughput:** Requests per second
- **Resource Usage:** Memory, CPU
- **Operation Timings:** Embedding, OCR, Qdrant, RAG, Upload

## Utilities

### Metrics Collector

Singleton service that tracks all performance metrics in real-time.

```javascript
const metricsCollector = require('./performance/utils/metrics-collector');

// Record a request
metricsCollector.recordRequest('/api/rag/ask', 2500, true);

// Record an operation
metricsCollector.recordOperation('embedding', 200);

// Get current metrics
const metrics = metricsCollector.getMetrics();
```

### Performance Logger

Structured logging for performance data with file-based persistence.

```javascript
const performanceLogger = require('./performance/utils/performance-logger');

// Log a request
performanceLogger.logRequest('/api/upload', 'POST', 3000, 200, 'user123');

// Log an operation
performanceLogger.logOperation('ocr', 'process-image', 5000, { 
    fileName: 'image.jpg' 
});

// Measure async operation
await performanceLogger.measureAsync(
    'rag',
    'query',
    'answer-question',
    async () => {
        return await answerQuestion(question);
    },
    { userId: 'user123' }
);
```

### Test Data Generator

Generate test data for benchmarking and load testing.

```javascript
const TestDataGenerator = require('./performance/utils/test-data-generator');

// Generate test questions
const questions = TestDataGenerator.generateTestQuestions(10);

// Generate test users
const users = TestDataGenerator.generateTestUsers(5);

// Create test files
const files = TestDataGenerator.createTestFileSet();

// Generate test chunks
const chunks = TestDataGenerator.generateTestChunks(100, 500);
```

## Benchmarking Details

### Embedding Benchmark

Tests:
- Single embedding generation (various text lengths)
- Batch embedding generation (10, 50, 100 embeddings)
- Concurrent embedding requests (1, 5, 10, 20 concurrent)

Metrics:
- Average duration
- Min/max duration
- Embeddings per second
- Throughput

### Qdrant Benchmark

Tests:
- Insert operations (single and batch)
- Search operations (various topK values)
- Filtered search (by userId)
- Delete operations

Metrics:
- Operations per second
- Latency percentiles
- Collection statistics

### RAG Benchmark

Tests:
- Standard RAG queries (various topK)
- Concurrent RAG queries
- Query complexity impact

Metrics:
- End-to-end latency
- Component breakdown (embedding, retrieval, LLM)
- Queries per second

## Load Testing Details

### RAG Load Test

Scenarios:
- **Light Load:** 10 concurrent connections, 30s
- **Medium Load:** 50 concurrent connections, 30s
- **Heavy Load:** 100 concurrent connections, 30s

Metrics:
- Total requests
- Requests per second
- Latency (p50, p95, p99)
- Error rate
- Success rate

### Artillery Configuration

The `artillery-config.yml` defines comprehensive load testing scenarios:

1. **Warm-up:** 30s at 1 user/s
2. **Ramp-up:** 60s from 1 to 10 users/s
3. **Sustained:** 120s at 10 users/s
4. **Spike:** 30s at 50 users/s
5. **Cool-down:** 30s at 5 users/s

Scenarios tested:
- RAG query flow (40% weight)
- File upload flow (30% weight)
- File list/view flow (20% weight)
- Authentication flow (10% weight)

## Capacity Planning

### Analysis Components

1. **Storage Requirements**
   - File storage per user
   - Qdrant vector storage
   - MongoDB metadata storage
   - Total storage projections

2. **Memory Requirements**
   - Base application memory
   - Per-operation memory
   - Concurrent operation capacity

3. **Concurrent User Capacity**
   - Theoretical max users
   - Safe concurrent users
   - Scaling thresholds

4. **Cost Projections**
   - Infrastructure costs
   - API costs (OpenAI)
   - Storage costs
   - Per-user cost breakdown

### Scaling Recommendations

- **100 users:** Single server (4 cores, 8GB RAM)
- **1,000 users:** 2 servers + load balancer
- **10,000 users:** 8 servers + managed services
- **50,000+ users:** Auto-scaling + multi-region

## Reports

All performance tests generate JSON reports in `performance/reports/`:

- `embedding-benchmark-results.json`
- `qdrant-benchmark-results.json`
- `rag-benchmark-results.json`
- `all-benchmarks-results.json`
- `rag-load-test-results.json`
- `all-load-tests-results.json`
- `capacity-analysis.json`

## Best Practices

### Running Benchmarks

1. Run on a clean system (no other heavy processes)
2. Ensure database is warmed up (run a few queries first)
3. Run multiple iterations for consistency
4. Document system specifications with results

### Running Load Tests

1. Ensure server is running and healthy
2. Use realistic test data
3. Monitor system resources during tests
4. Gradually increase load to find breaking points
5. Allow cool-down between test runs

### Interpreting Results

- **Latency:** Focus on p95 and p99, not just average
- **Throughput:** Consider both requests/sec and successful requests/sec
- **Error Rate:** Investigate any errors > 1%
- **Resource Usage:** Monitor memory leaks and CPU spikes

## Continuous Performance Testing

### Recommended Schedule

- **Daily:** Health checks and basic metrics review
- **Weekly:** Run light load tests
- **Monthly:** Full benchmark suite + capacity analysis
- **Quarterly:** Stress testing and optimization review

### Performance Regression Detection

Monitor for 20%+ increase in:
- RAG query latency (baseline: 2.5s)
- Vector search latency (baseline: 30ms)
- Embedding generation (baseline: 200ms)
- Error rate (baseline: 0.5%)

## Troubleshooting

### High Latency

1. Check LLM API status (primary bottleneck)
2. Review Qdrant collection size and performance
3. Check database query performance
4. Monitor network latency

### High Error Rate

1. Review error logs
2. Check API rate limits
3. Verify database connections
4. Check resource exhaustion (memory, CPU)

### Memory Issues

1. Check for memory leaks
2. Review concurrent operation limits
3. Monitor garbage collection
4. Consider increasing server memory

## Contributing

When adding new performance tests:

1. Follow existing patterns and structure
2. Use the shared utilities (metrics-collector, performance-logger)
3. Generate JSON reports in `performance/reports/`
4. Update this README with new test details
5. Add npm script to `package.json`

## Documentation

- **[PERFORMANCE.md](../PERFORMANCE.md)** - Comprehensive performance guide
- **[CAPACITY_PLANNING.md](../CAPACITY_PLANNING.md)** - Capacity planning details

---

*For questions or issues, please refer to the main project documentation.*
