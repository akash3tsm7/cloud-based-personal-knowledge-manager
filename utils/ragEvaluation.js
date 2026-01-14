const llmService = require('./llmService');
const ragService = require('./ragService');

/**
 * RAG Evaluation Module
 * Uses "LLM-as-a-Judge" to evaluate RAG pipeline performance.
 */

// Helper to parse LLM JSON output securely
function parseLLMJson(text) {
    try {
        // Remove markdown code blocks if present
        let cleaned = text.trim();
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Find JSON object in text (in case of extra conversational text)
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse LLM JSON response:", text);
        return {
            score: 0,
            reasoning: "Failed to parse LLM response format"
        };
    }
}

/**
 * Validate that parsed result has required fields
 */
function validateJudgeResult(result) {
    if (!result || typeof result !== 'object') {
        return { score: 0, reasoning: "Invalid judge result format" };
    }

    // Ensure score is a number between 0 and 1
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 1) {
        result.score = Math.max(0, Math.min(1, parseFloat(result.score) || 0));
    }

    // Ensure reasoning exists
    if (!result.reasoning || typeof result.reasoning !== 'string') {
        result.reasoning = "No reasoning provided";
    }

    return result;
}

/**
 * Base function for LLM Judges
 */
async function runJudge(judgeType, systemContext, userPrompt) {
    const fullPrompt = `You are an impartial judge evaluating a RAG system.

CRITICAL OUTPUT REQUIREMENTS:
1. You MUST return ONLY a valid JSON object, nothing else
2. Structure: { "score": 0.0, "reasoning": "your justification" }
3. NO markdown formatting, NO code blocks, NO extra text
4. Score must be a number between 0.0 and 1.0

JUDGE GUARDRAILS:
1. Do NOT use outside knowledge
2. Judge ONLY based on provided context
3. If insufficient information, return score < 0.3

${systemContext}

---

TASK:
${userPrompt}

Remember: Return ONLY the JSON object with score and reasoning.`;

    console.log(` [${judgeType}] Calling LLM...`);

    try {
        const rawOutput = await llmService.chat(fullPrompt, {
            model: llmService.MODELS.LLAMA_70B, // Use 70B for better evaluation quality
            temperature: 0.0, // Maximum determinism for scoring
            maxTokens: 400
        });

        console.log(` [${judgeType}] ✓ Response received`);
        const parsed = parseLLMJson(rawOutput);
        return validateJudgeResult(parsed);

    } catch (error) {
        console.error(` [${judgeType}] ✗ Failed:`, error.message);
        return {
            score: 0,
            reasoning: `Judge error: ${error.message}`
        };
    }
}

/**
 * 1. Context Relevance: Did we retrieve the right chunks?
 */
async function evaluateContextRelevance(question, context) {
    const prompt = `QUESTION: 
"${question}"

RETRIEVED CONTEXT:
${context}

EVALUATION TASK:
Does the retrieved context contain the necessary information to answer the question?

SCORING GUIDE:
- Score 1.0: All information needed to answer the question is present in the context
- Score 0.5: Partial information is present, but key details are missing
- Score 0.0: Context is completely irrelevant or contains no useful information

IMPORTANT NOTES:
- The context may consist of multiple chunks from the same document
- Facts may be distributed across different chunks
- Check ALL chunks before scoring
- If ANY chunk contains relevant information, consider it in your score`;

    return runJudge(
        "Context Relevance",
        "You evaluate Information Retrieval quality.",
        prompt
    );
}

/**
 * 2. Faithfulness: Did the answer stick to those chunks?
 */
async function evaluateFaithfulness(question, answer, context) {
    const prompt = `CONTEXT:
${context}

GENERATED ANSWER:
"${answer}"

EVALUATION TASK:
Is the generated answer derived EXACTLY and ONLY from the provided context?

SCORING GUIDE:
- Score 1.0: Every claim in the answer is supported by the context, OR the answer correctly states insufficient information
- Score 0.5: Most claims are supported but some minor details are not
- Score 0.0: The answer contains fabricated information or unsupported claims

IMPORTANT RULES:
- Saying "I don't have enough information" or "The context doesn't mention X" is FAITHFUL (score 1.0)
- Only penalize POSITIVE claims (facts, assertions) that aren't in the context
- The context may have multiple chunks - check ALL of them
- Cross-reference each claim in the answer against the context`;

    return runJudge(
        "Faithfulness",
        "You evaluate Answer Faithfulness and detect hallucinations.",
        prompt
    );
}

/**
 * 3. Answer Relevance: Did the answer actually answer the question?
 */
async function evaluateAnswerRelevance(question, answer) {
    const prompt = `QUESTION:
"${question}"

GENERATED ANSWER:
"${answer}"

EVALUATION TASK:
Does the answer directly and accurately address the user's question?

SCORING GUIDE:
- Score 1.0: The answer provides a complete, direct, and helpful response
- Score 0.8: The answer correctly states insufficient information (this IS a relevant response)
- Score 0.5: The answer is partially relevant but misses key aspects
- Score 0.0: The answer is off-topic or completely ignores the question

IMPORTANT RULES:
- "I don't have enough information" is RELEVANT when context truly lacks info (score 0.8)
- Only score low if the answer is evasive when it SHOULD be able to answer
- Focus on whether the answer addresses what was asked, not whether it's detailed`;

    return runJudge(
        "Answer Relevance",
        "You evaluate Answer Relevance to the Question.",
        prompt
    );
}

/**
 * Calculate Aggregate Metrics
 */
function calculateVerdict(retrieval, faithfulness, relevance) {
    const avg = (retrieval.score + faithfulness.score + relevance.score) / 3;

    let verdict = "POOR";
    if (avg >= 0.85) verdict = "EXCELLENT";
    else if (avg >= 0.7) verdict = "GOOD";
    else if (avg >= 0.5) verdict = "ACCEPTABLE";
    else if (avg >= 0.3) verdict = "WEAK";

    return {
        overallQuality: parseFloat(avg.toFixed(3)),
        verdict: verdict
    };
}

/**
 * Main Evaluation Wrapper
 */
async function evaluateRAG(question) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Starting RAG Evaluation`);
    console.log(`Question: "${question}"`);
    console.log('='.repeat(80));

    try {
        // 1. Run actual RAG pipeline
        console.log("\n📚 Step 1: Running RAG pipeline...");
        const result = await ragService.answerQuestion(question);

        // Validate RAG result
        if (!result || !result.answer) {
            throw new Error("RAG service did not return a valid answer");
        }

        const { answer, sources } = result;

        // Extract context from sources
        let context = '';
        if (result.context) {
            // If context is directly provided as a string
            context = result.context;
        } else if (sources && Array.isArray(sources)) {
            // If we need to build context from sources array
            context = sources
                .map((src, idx) => `[Chunk ${idx + 1}]\n${src.content || src.text || src}`)
                .join('\n\n');
        } else {
            throw new Error("RAG service did not return context or sources");
        }

        if (!context || context.trim().length === 0) {
            throw new Error("Retrieved context is empty");
        }

        console.log(`✓ Answer generated (${answer.length} chars)`);
        console.log(`✓ Context retrieved (${context.length} chars)`);
        console.log(`\n📝 Answer Preview: ${answer.substring(0, 150)}${answer.length > 150 ? '...' : ''}`);

        // 2. Run Parallel Evaluation
        console.log("\n⚖️  Step 2: Running evaluation judges...");
        const [retrieval, faithfulness, relevance] = await Promise.all([
            evaluateContextRelevance(question, context),
            evaluateFaithfulness(question, answer, context),
            evaluateAnswerRelevance(question, answer)
        ]);

        // 3. Calculate Aggregate Verdict
        console.log("\n📊 Step 3: Calculating overall verdict...");
        const aggregate = calculateVerdict(retrieval, faithfulness, relevance);

        // 4. Build Final Report
        const report = {
            question,
            answer,
            metrics: {
                contextRelevance: {
                    score: retrieval.score,
                    reasoning: retrieval.reasoning
                },
                faithfulness: {
                    score: faithfulness.score,
                    reasoning: faithfulness.reasoning
                },
                answerRelevance: {
                    score: relevance.score,
                    reasoning: relevance.reasoning
                }
            },
            overallQuality: aggregate.overallQuality,
            verdict: aggregate.verdict,
            metadata: {
                contextLength: context.length,
                answerLength: answer.length,
                timestamp: new Date().toISOString()
            }
        };

        // 5. Print Summary
        console.log("\n" + "=".repeat(80));
        console.log("📋 EVALUATION SUMMARY");
        console.log("=".repeat(80));
        console.log(`Context Relevance:  ${retrieval.score.toFixed(2)} - ${retrieval.reasoning}`);
        console.log(`Faithfulness:       ${faithfulness.score.toFixed(2)} - ${faithfulness.reasoning}`);
        console.log(`Answer Relevance:   ${relevance.score.toFixed(2)} - ${relevance.reasoning}`);
        console.log("-".repeat(80));
        console.log(`Overall Quality:    ${aggregate.overallQuality} / 1.0`);
        console.log(`Verdict:            ${aggregate.verdict}`);
        console.log("=".repeat(80) + "\n");

        return report;

    } catch (error) {
        console.error("\n❌ RAG Evaluation Failed:", error.message);
        console.error(error.stack);

        return {
            question,
            answer: null,
            metrics: {
                contextRelevance: { score: 0, reasoning: "Evaluation failed" },
                faithfulness: { score: 0, reasoning: "Evaluation failed" },
                answerRelevance: { score: 0, reasoning: "Evaluation failed" }
            },
            overallQuality: 0,
            verdict: "ERROR",
            error: error.message,
            metadata: {
                timestamp: new Date().toISOString()
            }
        };
    }
}

/**
 * Batch Evaluation - Evaluate multiple questions
 */
async function evaluateRAGBatch(questions) {
    console.log(`\n🔄 Starting batch evaluation for ${questions.length} questions...\n`);

    const results = [];
    for (let i = 0; i < questions.length; i++) {
        console.log(`\n[${i + 1}/${questions.length}] Processing...`);
        const result = await evaluateRAG(questions[i]);
        results.push(result);

        // Small delay to avoid rate limiting
        if (i < questions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Calculate batch statistics
    const validResults = results.filter(r => r.verdict !== "ERROR");
    const avgQuality = validResults.length > 0
        ? validResults.reduce((sum, r) => sum + r.overallQuality, 0) / validResults.length
        : 0;

    console.log("\n" + "=".repeat(80));
    console.log("📊 BATCH EVALUATION SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total Questions:    ${questions.length}`);
    console.log(`Successful:         ${validResults.length}`);
    console.log(`Failed:             ${results.length - validResults.length}`);
    console.log(`Average Quality:    ${avgQuality.toFixed(3)} / 1.0`);
    console.log("=".repeat(80) + "\n");

    return {
        results,
        summary: {
            total: questions.length,
            successful: validResults.length,
            failed: results.length - validResults.length,
            averageQuality: parseFloat(avgQuality.toFixed(3))
        }
    };
}

module.exports = {
    evaluateRAG,
    evaluateRAGBatch,
    evaluateContextRelevance,
    evaluateFaithfulness,
    evaluateAnswerRelevance
};