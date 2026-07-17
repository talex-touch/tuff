# Enforce Local Knowledge Token Budget

## Goal

Prevent LocalKnowledgeEngine.buildContext from returning an oversized first chunk and align the 2.5.3 context-budget contract.

## Background

`LocalKnowledgeEngine.buildContext()` currently admits the first search hit even when that chunk's `tokenEstimate` exceeds the normalized `tokenBudget`. This contradicts the 2.5.3 Context Builder contract and can make the assembled provider context exceed its host-owned budget.

## Requirements

- Every returned chunk MUST fit within the normalized token budget; the aggregate `tokenEstimate` MUST never exceed that budget.
- An oversized hit MUST be skipped even when it is the first result. Packing MUST continue so a later, smaller hit can still be selected.
- Existing document deduplication, `maxChunks`, citation ordering, FTS status, source/time/permission/metadata filters, and chunk contents MUST remain unchanged.
- Chunks MUST NOT be truncated because citation identity and indexed content must stay intact.
- When search succeeds with hits but no hit fits, the result MUST be `degraded` with `degradedReason: "token-budget-exhausted"`, empty context/chunks/citations, and `tokenEstimate: 0`; a genuine zero-hit search remains `ok` with empty output.

## Acceptance Criteria

- [x] A focused test proves an oversized first hit is skipped and a later fitting hit is returned with matching citation and an aggregate estimate within budget.
- [x] A focused test proves an all-oversized result returns the explicit `token-budget-exhausted` degraded state without leaking any chunk text.
- [x] Existing LocalKnowledgeEngine focused tests pass.
- [x] CoreApp node type-check and targeted lint pass.
- [x] The 2.5.3 PRD records the strict token-budget behavior without claiming unrelated embeddings/rerank or production-evidence work complete.

## Out of Scope

- Chunk splitting or truncation during context assembly.
- Embeddings, rerank, vector storage, ingestion UI, and real-profile evidence.
- Changes to search ranking, FTS schema, or plugin knowledge isolation.
