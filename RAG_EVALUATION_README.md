# RAG Evaluation - Quick Reference

## Run Evaluation
```bash
node scripts/evaluate_rag.js
```

## Understanding Scores

### Metrics (0.0 - 1.0)
- **Context Relevance**: Are retrieved chunks relevant?
- **Faithfulness**: Answer sticks to context only?
- **Answer Relevance**: Directly answers question?

### Verdicts
- **GOOD** (>0.8): High quality RAG
- **PARTIAL** (>0.5): Acceptable but needs improvement  
- **UNSUPPORTED** (≤0.5): Poor quality, investigate

## Key Files
- `utils/ragEvaluation.js` - Evaluation logic
- `scripts/evaluate_rag.js` - Test runner

## Troubleshooting
- Ensure MongoDB is connected
- Check NVIDIA_API_KEY in `.env`
- Uses LLAMA_8B for speed (can change to LLAMA_70B for better quality)
