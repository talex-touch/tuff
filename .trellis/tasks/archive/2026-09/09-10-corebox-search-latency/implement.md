# Search latency repair implementation

1. Finalize PRD and design; activate scoped task.
2. Concurrently implement read worker lifecycle, SearchIndexService read dispatch and high-signal regressions, under disjoint file ownership.
3. Main updates default short-search transport policy, wires reader lifecycle and propagates provider cancellation without changing ranking/candidate rules.
4. Run one scoped formatter/lint/typecheck/test pass after integration. Repair only regressions introduced by this work; report independent dirty-tree failures precisely.
5. Build isolated artifacts, run real CoreBox search and read-worker smoke; record first snapshot timing, matching results and responsive event loop. Do not restart or modify the user's live profile.
6. After smoke succeeds, update existing transport/search specs and task acceptance evidence, remove only owned throwaway artifacts, and hand off the local changes without push/release.
