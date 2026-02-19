require('dotenv').config();
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Capacity Analysis
 * Analyzes system capacity and generates projections
 */

class CapacityAnalyzer {
    constructor() {
        this.analysis = {
            timestamp: new Date().toISOString(),
            system: this.getSystemInfo(),
            storage: {},
            memory: {},
            concurrency: {},
            projections: {}
        };
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        return {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            cpuModel: os.cpus()[0].model,
            totalMemory: this.formatBytes(os.totalmem()),
            totalMemoryBytes: os.totalmem(),
            freeMemory: this.formatBytes(os.freemem()),
            freeMemoryBytes: os.freemem()
        };
    }

    /**
     * Calculate storage requirements
     */
    calculateStorageRequirements() {
        console.log('\n=== Storage Capacity Analysis ===\n');

        // Average file sizes (in bytes)
        const avgFileSizes = {
            pdf: 2 * 1024 * 1024,        // 2 MB
            image: 1 * 1024 * 1024,       // 1 MB
            document: 500 * 1024,         // 500 KB
            text: 100 * 1024              // 100 KB
        };

        // Average chunks per file
        const avgChunksPerFile = {
            pdf: 50,
            image: 10,
            document: 30,
            text: 10
        };

        // Embedding storage (1536 dimensions × 4 bytes per float)
        const embeddingSize = 1536 * 4; // 6,144 bytes per embedding

        // MongoDB document overhead
        const mongoOverhead = 500; // bytes per document

        // Calculate per-user storage
        const filesPerUser = 20; // Average files per user
        const fileTypeDistribution = {
            pdf: 0.4,
            image: 0.2,
            document: 0.3,
            text: 0.1
        };

        let totalFileStorage = 0;
        let totalChunks = 0;
        let totalEmbeddingStorage = 0;
        let totalMongoStorage = 0;

        Object.keys(fileTypeDistribution).forEach(type => {
            const fileCount = filesPerUser * fileTypeDistribution[type];
            const fileStorage = fileCount * avgFileSizes[type];
            const chunks = fileCount * avgChunksPerFile[type];
            const embeddingStorage = chunks * embeddingSize;
            const mongoStorage = fileCount * mongoOverhead + chunks * mongoOverhead;

            totalFileStorage += fileStorage;
            totalChunks += chunks;
            totalEmbeddingStorage += embeddingStorage;
            totalMongoStorage += mongoStorage;

            console.log(`${type.toUpperCase()}:`);
            console.log(`  Files: ${fileCount.toFixed(1)}`);
            console.log(`  Storage: ${this.formatBytes(fileStorage)}`);
            console.log(`  Chunks: ${chunks.toFixed(0)}`);
            console.log(`  Embeddings: ${this.formatBytes(embeddingStorage)}`);
        });

        const totalPerUser = totalFileStorage + totalEmbeddingStorage + totalMongoStorage;

        console.log(`\nPER USER TOTALS:`);
        console.log(`  Files: ${filesPerUser}`);
        console.log(`  File Storage: ${this.formatBytes(totalFileStorage)}`);
        console.log(`  Chunks: ${totalChunks.toFixed(0)}`);
        console.log(`  Qdrant Vectors: ${this.formatBytes(totalEmbeddingStorage)}`);
        console.log(`  MongoDB: ${this.formatBytes(totalMongoStorage)}`);
        console.log(`  Total per User: ${this.formatBytes(totalPerUser)}`);

        this.analysis.storage = {
            perUser: {
                files: filesPerUser,
                fileStorage: totalFileStorage,
                fileStorageFormatted: this.formatBytes(totalFileStorage),
                chunks: Math.round(totalChunks),
                qdrantStorage: totalEmbeddingStorage,
                qdrantStorageFormatted: this.formatBytes(totalEmbeddingStorage),
                mongoStorage: totalMongoStorage,
                mongoStorageFormatted: this.formatBytes(totalMongoStorage),
                total: totalPerUser,
                totalFormatted: this.formatBytes(totalPerUser)
            }
        };

        return this.analysis.storage;
    }

    /**
     * Calculate user capacity projections
     */
    calculateUserProjections() {
        console.log('\n=== User Capacity Projections ===\n');

        const userCounts = [100, 1000, 10000, 50000];
        const projections = [];

        userCounts.forEach(userCount => {
            const fileStorage = this.analysis.storage.perUser.fileStorage * userCount;
            const qdrantStorage = this.analysis.storage.perUser.qdrantStorage * userCount;
            const mongoStorage = this.analysis.storage.perUser.mongoStorage * userCount;
            const totalStorage = fileStorage + qdrantStorage + mongoStorage;
            const totalVectors = this.analysis.storage.perUser.chunks * userCount;

            const projection = {
                users: userCount,
                fileStorage: this.formatBytes(fileStorage),
                qdrantStorage: this.formatBytes(qdrantStorage),
                mongoStorage: this.formatBytes(mongoStorage),
                totalStorage: this.formatBytes(totalStorage),
                totalVectors: totalVectors,
                estimatedCost: this.estimateCost(totalStorage, totalVectors)
            };

            projections.push(projection);

            console.log(`${userCount} USERS:`);
            console.log(`  File Storage: ${projection.fileStorage}`);
            console.log(`  Qdrant Storage: ${projection.qdrantStorage}`);
            console.log(`  MongoDB Storage: ${projection.mongoStorage}`);
            console.log(`  Total Storage: ${projection.totalStorage}`);
            console.log(`  Total Vectors: ${totalVectors.toLocaleString()}`);
            console.log(`  Estimated Monthly Cost: $${projection.estimatedCost.toFixed(2)}`);
            console.log('');
        });

        this.analysis.projections.users = projections;
        return projections;
    }

    /**
     * Calculate memory requirements
     */
    calculateMemoryRequirements() {
        console.log('\n=== Memory Requirements ===\n');

        // Estimated memory per operation
        const memoryPerOperation = {
            fileUpload: 50 * 1024 * 1024,      // 50 MB (file + processing)
            embeddingGeneration: 10 * 1024 * 1024,  // 10 MB
            ragQuery: 20 * 1024 * 1024,        // 20 MB (retrieval + LLM)
            ocrProcessing: 100 * 1024 * 1024   // 100 MB (image processing)
        };

        // Base application memory
        const baseMemory = 200 * 1024 * 1024; // 200 MB

        // Calculate concurrent operation capacity
        const availableMemory = os.freemem();
        const safeMemory = availableMemory * 0.7; // Use 70% of free memory

        const concurrentCapacity = {};
        Object.keys(memoryPerOperation).forEach(operation => {
            const capacity = Math.floor((safeMemory - baseMemory) / memoryPerOperation[operation]);
            concurrentCapacity[operation] = Math.max(1, capacity);

            console.log(`${operation}:`);
            console.log(`  Memory per operation: ${this.formatBytes(memoryPerOperation[operation])}`);
            console.log(`  Concurrent capacity: ${concurrentCapacity[operation]}`);
        });

        console.log(`\nSYSTEM MEMORY:`);
        console.log(`  Total: ${this.formatBytes(os.totalmem())}`);
        console.log(`  Free: ${this.formatBytes(os.freemem())}`);
        console.log(`  Safe for operations: ${this.formatBytes(safeMemory)}`);

        this.analysis.memory = {
            total: os.totalmem(),
            free: os.freemem(),
            safeMemory,
            baseMemory,
            memoryPerOperation,
            concurrentCapacity
        };

        return this.analysis.memory;
    }

    /**
     * Calculate concurrent user capacity
     */
    calculateConcurrentUserCapacity() {
        console.log('\n=== Concurrent User Capacity ===\n');

        // Average requests per user per minute
        const requestsPerUserPerMinute = 5;

        // Average response time (ms)
        const avgResponseTime = 2000; // 2 seconds

        // Calculate theoretical max concurrent users
        const cpuCores = os.cpus().length;
        const requestsPerSecond = (cpuCores * 1000) / avgResponseTime;
        const maxConcurrentUsers = Math.floor((requestsPerSecond * 60) / requestsPerUserPerMinute);

        // Apply safety factor (70%)
        const safeConcurrentUsers = Math.floor(maxConcurrentUsers * 0.7);

        console.log(`CPU Cores: ${cpuCores}`);
        console.log(`Avg Response Time: ${avgResponseTime}ms`);
        console.log(`Theoretical Requests/sec: ${requestsPerSecond.toFixed(2)}`);
        console.log(`Max Concurrent Users (theoretical): ${maxConcurrentUsers}`);
        console.log(`Safe Concurrent Users (70%): ${safeConcurrentUsers}`);

        this.analysis.concurrency = {
            cpuCores,
            avgResponseTime,
            requestsPerSecond,
            maxConcurrentUsers,
            safeConcurrentUsers,
            requestsPerUserPerMinute
        };

        return this.analysis.concurrency;
    }

    /**
     * Estimate cloud hosting cost
     */
    estimateCost(storageBytes, vectorCount) {
        // Rough estimates (adjust based on actual cloud provider)
        const storageCostPerGB = 0.10; // $0.10 per GB per month
        const vectorCostPer1M = 50;     // $50 per 1M vectors per month
        const computeCost = 50;         // Base compute cost

        const storageGB = storageBytes / (1024 * 1024 * 1024);
        const vectorMillions = vectorCount / 1000000;

        const storageCost = storageGB * storageCostPerGB;
        const vectorCost = vectorMillions * vectorCostPer1M;

        return storageCost + vectorCost + computeCost;
    }

    /**
     * Format bytes to human-readable string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Run complete capacity analysis
     */
    async runAnalysis() {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║      CAPACITY PLANNING ANALYSIS       ║');
        console.log('╚════════════════════════════════════════╝');

        this.calculateStorageRequirements();
        this.calculateUserProjections();
        this.calculateMemoryRequirements();
        this.calculateConcurrentUserCapacity();

        // Generate recommendations
        this.analysis.recommendations = this.generateRecommendations();

        // Save results
        const resultsDir = path.join(process.cwd(), 'performance', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsFile = path.join(resultsDir, 'capacity-analysis.json');
        fs.writeFileSync(resultsFile, JSON.stringify(this.analysis, null, 2));

        console.log('\n✅ Capacity analysis completed!');
        console.log(`📊 Results saved to: ${resultsFile}\n`);

        return this.analysis;
    }

    /**
     * Generate recommendations based on analysis
     */
    generateRecommendations() {
        const recommendations = [];

        // Memory recommendations
        const freeMemoryGB = os.freemem() / (1024 * 1024 * 1024);
        if (freeMemoryGB < 2) {
            recommendations.push({
                type: 'memory',
                severity: 'high',
                message: `Low free memory (${freeMemoryGB.toFixed(2)} GB). Consider upgrading to at least 8GB RAM for production.`
            });
        }

        // CPU recommendations
        if (os.cpus().length < 4) {
            recommendations.push({
                type: 'cpu',
                severity: 'medium',
                message: `Limited CPU cores (${os.cpus().length}). Consider at least 4 cores for better concurrent user handling.`
            });
        }

        // Scaling recommendations
        recommendations.push({
            type: 'scaling',
            severity: 'info',
            message: `For 1000+ users, consider implementing horizontal scaling with load balancing.`
        });

        recommendations.push({
            type: 'storage',
            severity: 'info',
            message: `Implement storage cleanup policies for old/unused files to manage costs.`
        });

        recommendations.push({
            type: 'caching',
            severity: 'info',
            message: `Implement Redis caching for frequently accessed embeddings and RAG results.`
        });

        return recommendations;
    }
}

// Run if executed directly
if (require.main === module) {
    const analyzer = new CapacityAnalyzer();
    analyzer.runAnalysis()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = CapacityAnalyzer;
