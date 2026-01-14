# RAG Evaluation Pipeline - Fixes Applied

## Issue 1: MongoDB Connection Timeout
**Problem**: Evaluation script couldn't connect to database
**Fix**: Added `mongoose.connect()` to `scripts/evaluate_rag.js`
**Status**: ✅ Fixed

## Issue 2: LLM Timeout
**Problem**: LLAMA_70B was too slow, causing timeouts
**Fix**: Switched to LLAMA_8B in `ragEvaluation.js`
**Status**: ✅ Fixed

## Issue 3: Judge Context Mismatch
**Problem**: Judges reconstructed context differently than answer LLM
**Fix**: Modified `ragService.js` to return actual `context` string used for generation
**Impact**: Eliminated false negatives where judges couldn't find information
**Status**: ✅ Fixed

## Issue 4: Faithfulness Judge Meta-Statement Bug
**Problem**: Judge treated "the context does not mention X" as hallucination
**Fix**: Rewrote prompt to distinguish:
- **Meta-statements** (always score 1.0): "I don't know", "context doesn't mention X"
- **Factual claims** (must be in context): "Python is a skill", "Candidate went to MIT"
**Status**: ✅ Fixed

## Files Modified
1. `utils/ragService.js` - Returns `context` string
2. `utils/ragEvaluation.js` - Fixed all judge prompts
3. `scripts/evaluate_rag.js` - Added MongoDB connection

## Testing
Run: `node scripts/evaluate_rag.js`

Expected behavior:
- "What is the capital of Mars?" → Faithfulness = 1.0 (meta-statement)
- Skills/Education questions → Faithfulness = 1.0 (if answer matches context)
