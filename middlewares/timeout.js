/**
 * Request Timeout Middleware
 * Prevents requests from hanging indefinitely
 */

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Create timeout middleware
 * @param {number} timeout - Timeout in milliseconds
 */
function createTimeoutMiddleware(timeout = DEFAULT_TIMEOUT) {
    return (req, res, next) => {
        // Set timeout on request
        req.setTimeout(timeout, () => {
            if (!res.headersSent) {
                console.warn(`Request timeout after ${timeout}ms: ${req.method} ${req.path}`);
                res.status(408).json({
                    success: false,
                    message: 'Request timeout',
                    error: `Request exceeded ${timeout}ms timeout`
                });
            }
        });

        // Set timeout on response
        res.setTimeout(timeout, () => {
            if (!res.headersSent) {
                console.warn(`Response timeout after ${timeout}ms: ${req.method} ${req.path}`);
                res.status(408).json({
                    success: false,
                    message: 'Request timeout',
                    error: `Response exceeded ${timeout}ms timeout`
                });
            }
        });

        next();
    };
}

module.exports = {
    createTimeoutMiddleware,
    DEFAULT_TIMEOUT
};
