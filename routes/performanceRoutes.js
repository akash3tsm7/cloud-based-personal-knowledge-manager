const express = require('express');
const router = express.Router();
const metricsCollector = require('../performance/utils/metrics-collector');
const performanceLogger = require('../performance/utils/performance-logger');
const { authenticateToken } = require('../middlewares/auth');

/**
 * @route   GET /api/performance/metrics
 * @desc    Get current performance metrics
 * @access  Protected
 */
router.get('/metrics', authenticateToken, (req, res) => {
    try {
        const metrics = metricsCollector.getMetrics();

        res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch metrics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/performance/health
 * @desc    Health check with detailed stats
 * @access  Public
 */
router.get('/health', (req, res) => {
    try {
        const metrics = metricsCollector.getMetrics();
        const memUsage = process.memoryUsage();

        const health = {
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            memory: {
                heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
            },
            requests: {
                total: metrics.requests.total,
                successful: metrics.requests.successful,
                failed: metrics.requests.failed,
                errorRate: metrics.requests.total > 0
                    ? ((metrics.requests.failed / metrics.requests.total) * 100).toFixed(2) + '%'
                    : '0%'
            },
            performance: {
                avgLatency: `${metrics.latency.avg.toFixed(2)}ms`,
                p95Latency: `${metrics.latency.p95.toFixed(2)}ms`,
                throughput: `${metrics.throughput.requestsPerSecond.toFixed(2)} req/s`
            }
        };

        res.status(200).json(health);
    } catch (error) {
        console.error('Error in health check:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/performance/logs
 * @desc    Get performance logs for a specific date
 * @access  Protected
 */
router.get('/logs', authenticateToken, (req, res) => {
    try {
        const { date, category, operation } = req.query;

        let logs;
        if (category) {
            logs = performanceLogger.getLogsByCategory(category, date);
        } else if (operation) {
            logs = performanceLogger.getLogsByOperation(operation, date);
        } else {
            logs = performanceLogger.readLogs(date);
        }

        res.status(200).json({
            success: true,
            count: logs.length,
            data: logs
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/performance/stats
 * @desc    Get aggregated performance statistics
 * @access  Protected
 */
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const { date } = req.query;
        const stats = performanceLogger.analyzeLogs(date);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stats',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/performance/reset
 * @desc    Reset performance metrics
 * @access  Protected
 */
router.post('/reset', authenticateToken, (req, res) => {
    try {
        metricsCollector.reset();

        res.status(200).json({
            success: true,
            message: 'Performance metrics reset successfully'
        });
    } catch (error) {
        console.error('Error resetting metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset metrics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/performance/export
 * @desc    Export performance metrics as JSON
 * @access  Protected
 */
router.get('/export', authenticateToken, (req, res) => {
    try {
        const metrics = metricsCollector.exportMetrics();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=performance-metrics-${Date.now()}.json`);
        res.send(metrics);
    } catch (error) {
        console.error('Error exporting metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export metrics',
            error: error.message
        });
    }
});

module.exports = router;
