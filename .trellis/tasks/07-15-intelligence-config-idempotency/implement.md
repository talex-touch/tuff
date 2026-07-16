# Implementation plan

1. Refactor prompt record upsert to exclude generated time from equality and preserve current time on no-op.
2. Assign a fresh time only for insert/semantic change.
3. Confirm normal repeated loads perform no save/runtime rebuild while explicit force reload still works.
4. Exercise a real semantic prompt change and verify one update.
