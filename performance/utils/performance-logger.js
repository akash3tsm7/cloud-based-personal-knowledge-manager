const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

/**
 * Performance Logger
 * Structured logging for performance data with timestamps and categorization
 */
class PerformanceLogger {
    constructor(logDir = 'performance/logs') {
        this.logDir = logDir;
        this.ensureLogDirectory();
        this.currentLogFile = this.getLogFilePath();
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        const fullPath = path.join(process.cwd(), this.logDir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }

    /**
     * Get log file path for current date
     */
    getLogFilePath() {
        const date = new Date().toISOString().split('T')[0];
        return path.join(process.cwd(), this.logDir, `performance-${date}.log`);
    }

    /**
     * Log performance event
     */
    log(category, operation, data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            category,
            operation,
            data
        };

        const logLine = JSON.stringify(logEntry) + '\n';

        try {
            fs.appendFileSync(this.currentLogFile, logLine);
        } catch (error) {
            console.error('Failed to write to performance log:', error.message);
        }
    }

    /**
     * Log request timing
     */
    logRequest(endpoint, method, duration, statusCode, userId = null) {
        this.log('request', 'http', {
            endpoint,
            method,
            duration,
            statusCode,
            userId
        });
    }

    /**
     * Log operation timing
     */
    logOperation(operationType, operationName, duration, metadata = {}) {
        this.log('operation', operationType, {
            name: operationName,
            duration,
            ...metadata
        });
    }

    /**
     * Log error
     */
    logError(category, operation, error, metadata = {}) {
        this.log('error', operation, {
            category,
            error: error.message,
            stack: error.stack,
            ...metadata
        });
    }

    /**
     * Log resource usage
     */
    logResourceUsage(memoryUsage, cpuUsage) {
        this.log('resource', 'usage', {
            memory: memoryUsage,
            cpu: cpuUsage
        });
    }

    /**
     * Create a timer for measuring operation duration
     */
    startTimer() {
        return performance.now();
    }

    /**
     * End timer and return duration
     */
    endTimer(startTime) {
        return performance.now() - startTime;
    }

    /**
     * Measure and log an async operation
     */
    async measureAsync(category, operationType, operationName, asyncFn, metadata = {}) {
        const startTime = this.startTimer();
        let error = null;
        let result = null;

        try {
            result = await asyncFn();
        } catch (err) {
            error = err;
            this.logError(category, operationName, err, metadata);
        }

        const duration = this.endTimer(startTime);

        if (!error) {
            this.logOperation(operationType, operationName, duration, metadata);
        }

        if (error) throw error;
        return result;
    }

    /**
     * Measure and log a sync operation
     */
    measureSync(category, operationType, operationName, syncFn, metadata = {}) {
        const startTime = this.startTimer();
        let error = null;
        let result = null;

        try {
            result = syncFn();
        } catch (err) {
            error = err;
            this.logError(category, operationName, err, metadata);
        }

        const duration = this.endTimer(startTime);

        if (!error) {
            this.logOperation(operationType, operationName, duration, metadata);
        }

        if (error) throw error;
        return result;
    }

    /**
     * Read logs for a specific date
     */
    readLogs(date = null) {
        const logFile = date
            ? path.join(process.cwd(), this.logDir, `performance-${date}.log`)
            : this.currentLogFile;

        if (!fs.existsSync(logFile)) {
            return [];
        }

        const content = fs.readFileSync(logFile, 'utf-8');
        return content
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
    }

    /**
     * Get logs filtered by category
     */
    getLogsByCategory(category, date = null) {
        const logs = this.readLogs(date);
        return logs.filter(log => log.category === category);
    }

    /**
     * Get logs filtered by operation
     */
    getLogsByOperation(operation, date = null) {
        const logs = this.readLogs(date);
        return logs.filter(log => log.operation === operation);
    }

    /**
     * Analyze logs and generate statistics
     */
    analyzeLogs(date = null) {
        const logs = this.readLogs(date);

        const stats = {
            totalEvents: logs.length,
            byCategory: {},
            byOperation: {},
            errors: 0,
            avgDurations: {}
        };

        logs.forEach(log => {
            // Count by category
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;

            // Count by operation
            stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;

            // Count errors
            if (log.category === 'error') {
                stats.errors++;
            }

            // Calculate average durations
            if (log.data && log.data.duration !== undefined) {
                const key = `${log.category}_${log.operation}`;
                if (!stats.avgDurations[key]) {
                    stats.avgDurations[key] = { total: 0, count: 0, samples: [] };
                }
                stats.avgDurations[key].total += log.data.duration;
                stats.avgDurations[key].count++;
                stats.avgDurations[key].samples.push(log.data.duration);
            }
        });

        // Calculate averages
        Object.keys(stats.avgDurations).forEach(key => {
            const data = stats.avgDurations[key];
            data.avg = data.total / data.count;
            data.min = Math.min(...data.samples);
            data.max = Math.max(...data.samples);
            delete data.samples; // Remove samples to reduce size
        });

        return stats;
    }

    /**
     * Clear old logs (older than specified days)
     */
    clearOldLogs(daysToKeep = 7) {
        const logFiles = fs.readdirSync(path.join(process.cwd(), this.logDir));
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        logFiles.forEach(file => {
            if (!file.startsWith('performance-')) return;

            const dateStr = file.replace('performance-', '').replace('.log', '');
            const fileDate = new Date(dateStr);

            if (fileDate < cutoffDate) {
                const filePath = path.join(process.cwd(), this.logDir, file);
                fs.unlinkSync(filePath);
                console.log(`Deleted old log file: ${file}`);
            }
        });
    }
}

// Singleton instance
const performanceLogger = new PerformanceLogger();

module.exports = performanceLogger;
