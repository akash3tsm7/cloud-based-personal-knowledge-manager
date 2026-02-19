/**
 * Artillery Load Test Processor
 * Custom functions for Artillery load tests
 */

const TestDataGenerator = require('../utils/test-data-generator');

/**
 * Generate random question for RAG testing
 */
function generateRandomQuestion(context, events, done) {
    const questions = TestDataGenerator.generateTestQuestions(1);
    context.vars.question = questions[0];
    return done();
}

/**
 * Generate random user credentials
 */
function generateRandomUser(context, events, done) {
    const users = TestDataGenerator.generateTestUsers(1);
    context.vars.username = users[0].username;
    context.vars.email = users[0].email;
    context.vars.password = users[0].password;
    return done();
}

/**
 * Log response time
 */
function logResponseTime(requestParams, response, context, ee, next) {
    if (response.timings) {
        console.log(`Response time: ${response.timings.phases.total}ms`);
    }
    return next();
}

/**
 * Validate response
 */
function validateResponse(requestParams, response, context, ee, next) {
    if (response.statusCode >= 400) {
        console.error(`Error response: ${response.statusCode} - ${response.body}`);
    }
    return next();
}

module.exports = {
    generateRandomQuestion,
    generateRandomUser,
    logResponseTime,
    validateResponse
};
