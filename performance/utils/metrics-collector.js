const { performance } = require('perf_hooks');
const os = require('os');

/**
 * Performance Metrics Collector
 * Tracks and aggregates performance metrics for the application
 */
class MetricsCollector {
    constructor() {
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                byEndpoint: {}
            },
            latency: {
                samples: [],
                p50: 0,
                p95: 0,
                p99: 0,
                avg: 0,
                min: Infinity,
                max: 0
            },
            throughput: {
                requestsPerSecond: 0,
                startTime: Date.now()
            },
            resources: {
                memory: [],
                cpu: []
            },
            operations: {
                embedding: { count: 0, totalTime: 0, samples: [] },
                ocr: { count: 0, totalTime: 0, samples: [] },
                qdrant: { count: 0, totalTime: 0, samples: [] },
                rag: { count: 0, totalTime: 0, samples: [] },
                upload: { count: 0, totalTime: 0, samples: [] }
            }
        };
    }

    /**
     * Record a request
     */
    recordRequest(endpoint, duration, success = true) {
        this.metrics.requests.total++;
        
        if (success) {
            this.metrics.requests.successful++;
        } else {
            this.metrics.requests.failed++;
        }

        // Track by endpoint
        if (!this.metrics.requests.byEndpoint[endpoint]) {
            this.metrics.requests.byEndpoint[endpoint] = {
                total: 0,
                successful: 0,
                failed: 0,
                latencies: []
            };
        }
        
        this.metrics.requests.byEndpoint[endpoint].total++;
        if (success) {
            this.metrics.requests.byEndpoint[endpoint].successful++;
        } else {
            this.metrics.requests.byEndpoint[endpoint].failed++;
        }
        this.metrics.requests.byEndpoint[endpoint].latencies.push(duration);

        // Record latency
        this.recordLatency(duration);
    }

    /**
     * Record latency sample
     */
    recordLatency(duration) {
        this.metrics.latency.samples.push(duration);
        this.metrics.latency.min = Math.min(this.metrics.latency.min, duration);
        this.metrics.latency.max = Math.max(this.metrics.latency.max, duration);

        // Keep only last 10000 samples to prevent memory issues
        if (this.metrics.latency.samples.length > 10000) {
            this.metrics.latency.samples.shift();
        }

        this.calculateLatencyPercentiles();
    }

    /**
     * Calculate latency percentiles
     */
    calculateLatencyPercentiles() {
        const sorted = [...this.metrics.latency.samples].sort((a, b) => a - b);
        const len = sorted.length;

        if (len === 0) return;

        this.metrics.latency.p50 = sorted[Math.floor(len * 0.5)];
        this.metrics.latency.p95 = sorted[Math.floor(len * 0.95)];
        this.metrics.latency.p99 = sorted[Math.floor(len * 0.99)];
        this.metrics.latency.avg = sorted.reduce((a, b) => a + b, 0) / len;
    }

    /**
     * Record operation timing
     */
    recordOperation(operationType, duration) {
        if (this.metrics.operations[operationType]) {
            this.metrics.operations[operationType].count++;
            this.metrics.operations[operationType].totalTime += duration;
            this.metrics.operations[operationType].samples.push(duration);

            // Keep only last 1000 samples per operation
            if (this.metrics.operations[operationType].samples.length > 1000) {
                this.metrics.operations[operationType].samples.shift();
            }
        }
    }

    /**
     * Record resource usage
     */
    recordResourceUsage() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        this.metrics.resources.memory.push({
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        });

        this.metrics.resources.cpu.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });

        // Keep only last 1000 samples
        if (this.metrics.resources.memory.length > 1000) {
            this.metrics.resources.memory.shift();
        }
        if (this.metrics.resources.cpu.length > 1000) {
            this.metrics.resources.cpu.shift();
        }
    }

    /**
     * Calculate throughput
     */
    calculateThroughput() {
        const elapsedSeconds = (Date.now() - this.metrics.throughput.startTime) / 1000;
        this.metrics.throughput.requestsPerSecond = this.metrics.requests.total / elapsedSeconds;
        return this.metrics.throughput.requestsPerSecond;
    }

    /**
     * Get operation statistics
     */
    getOperationStats(operationType) {
        const op = this.metrics.operations[operationType];
        if (!op || op.count === 0) {
            return null;
        }

        const sorted = [...op.samples].sort((a, b) => a - b);
        return {
            count: op.count,
            totalTime: op.totalTime,
            avgTime: op.totalTime / op.count,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
            min: Math.min(...sorted),
            max: Math.max(...sorted)
        };
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        this.calculateThroughput();
        
        return {
            requests: this.metrics.requests,
            latency: {
                p50: this.metrics.latency.p50,
                p95: this.metrics.latency.p95,
                p99: this.metrics.latency.p99,
                avg: this.metrics.latency.avg,
                min: this.metrics.latency.min,
                max: this.metrics.latency.max
            },
            throughput: this.metrics.throughput,
            operations: {
                embedding: this.getOperationStats('embedding'),
                ocr: this.getOperationStats('ocr'),
                qdrant: this.getOperationStats('qdrant'),
                rag: this.getOperationStats('rag'),
                upload: this.getOperationStats('upload')
            },
            resources: {
                memory: this.getLatestResourceMetric('memory'),
                cpu: this.getLatestResourceMetric('cpu')
            },
            system: {
                platform: os.platform(),
                cpus: os.cpus().length,
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                uptime: os.uptime()
            }
        };
    }

    /**
     * Get latest resource metric
     */
    getLatestResourceMetric(type) {
        const metrics = this.metrics.resources[type];
        if (metrics.length === 0) return null;
        return metrics[metrics.length - 1];
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                byEndpoint: {}
            },
            latency: {
                samples: [],
                p50: 0,
                p95: 0,
                p99: 0,
                avg: 0,
                min: Infinity,
                max: 0
            },
            throughput: {
                requestsPerSecond: 0,
                startTime: Date.now()
            },
            resources: {
                memory: [],
                cpu: []
            },
            operations: {
                embedding: { count: 0, totalTime: 0, samples: [] },
                ocr: { count: 0, totalTime: 0, samples: [] },
                qdrant: { count: 0, totalTime: 0, samples: [] },
                rag: { count: 0, totalTime: 0, samples: [] },
                upload: { count: 0, totalTime: 0, samples: [] }
            }
        };
    }

    /**
     * Export metrics to JSON
     */
    exportMetrics() {
        return JSON.stringify(this.getMetrics(), null, 2);
    }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

// Start periodic resource monitoring (every 5 seconds)
setInterval(() => {
    metricsCollector.recordResourceUsage();
}, 5000);

module.exports = metricsCollector;
