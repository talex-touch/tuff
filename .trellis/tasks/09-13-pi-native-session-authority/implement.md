# Implementation: Pi native session authority for Home

1. Add/register migration 0047 and Drizzle conversation binding; verify the full chain, uniqueness, and explicit local/sync deletion semantics.
2. Extend the pointer store with conversation lookup/bind/list exclusion and shared lease singleton.
3. Carry opaque Home conversation/project identity through the existing typed metadata boundary.
4. Add Pi native-session args, latest-turn prompt selection, canonical cwd, ordered session-id observation, pointer state handling, and shared lease teardown.
5. Keep non-Home Pi calls ephemeral and retain attachment/tool/cancellation/commit behavior.
6. Delegate permanent migration/store/provider/renderer tests to the Tester agent.
7. Run focused tests, builds, typechecks, privacy checks, changed lint, and diff checks.
8. Prove first turn, continuation, restart, one-time legacy seed, busy rejection, missing session, and transcript privacy with an isolated Electron profile and throwaway Pi stub.
