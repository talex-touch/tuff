## Priority

P1 - restore the documented Nexus API/routes quality gate.

## Summary

Audited on default-branch commit [`784377c499899529145c0dac7f1d0000329e0794`](https://github.com/talex-touch/tuff/commit/784377c499899529145c0dac7f1d0000329e0794).

`corepack pnpm -C apps/nexus run check:api-routes` exits 1 because five Vitest files live under `apps/nexus/server/api`:

```text
admin/analytics/intelligence.get.test.ts
admin/intelligence-agent/session/stream.post.test.ts
admin/intelligence-agent/session/trace.get.test.ts
v1/intelligence/invoke.post.test.ts
v1/intelligence/stream.post.test.ts
```

The guard intentionally reserves `server/api` for runtime handlers. All five files were added together by `7faea27bf`; an earlier misplaced app-auth route test had already been moved out of this tree so the same guard could pass.

## Reproduction

```bash
corepack pnpm -C apps/nexus run check:api-routes
```

The command prints the five paths above and exits 1.

Current local Nuxt returned 404 for direct test-like GET and synthetic empty POST paths, so this report does not claim that the files are currently exposed as callable endpoints. The structural gate is still broken, and scanner behavior must not depend on framework-version ignore rules.

## Expected

`server/api` contains runtime route handlers only, test suites live under the established test hierarchy, and the route-tree guard passes.

## Actual

Five tests are colocated with runtime handlers and make the documented guard fail.

## Evidence and root cause

- [The route-tree guard explicitly rejects `__tests__`, `*.test.ts`, `*.api.test.ts`, and `test-utils.ts`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/build/check-server-api-route-tree.mjs#L7-L46).
- [Admin analytics test under `server/api`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/admin/analytics/intelligence.get.test.ts).
- [Admin agent stream test under `server/api`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/admin/intelligence-agent/session/stream.post.test.ts).
- [Admin agent trace test under `server/api`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/admin/intelligence-agent/session/trace.get.test.ts).
- [Public intelligence invoke test under `server/api`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/v1/intelligence/invoke.post.test.ts).
- [Public intelligence stream test under `server/api`](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/v1/intelligence/stream.post.test.ts).

Commit [`7faea27bf`](https://github.com/talex-touch/tuff/commit/7faea27bf61a9a4f551f2be432afacd0e25fa6a6) introduced all five beside their handlers instead of under `test/api`.

## Impact

- The documented API/routes quality gate is permanently red.
- Route-tree cleanliness depends on current Nitro ignore behavior rather than a repository-owned invariant.
- Future scanner/version changes could turn colocated test modules into build/type generation or route ownership failures.
- Release triage receives avoidable noise around security-sensitive intelligence routes.

## Required outcome

Move the tests to the established test tree, preserve their coverage, and keep the route-tree guard fail-closed.

## Acceptance criteria

- [ ] No `*.test.ts`, `*.api.test.ts`, `__tests__`, or `test-utils.ts` remains under `apps/nexus/server/api`.
- [ ] All five moved suites retain their positive, auth, quota, stream, and sanitization coverage.
- [ ] Production intelligence routes retain their existing URL, HTTP method, and authentication boundary.
- [ ] Test-like paths are absent from generated Nitro route/type manifests.
- [ ] `check:api-routes`, focused tests, typecheck, and production build pass.
- [ ] The route-tree guard is not weakened with new ignores for these files.

## Verification

```bash
corepack pnpm -C apps/nexus run check:api-routes
corepack pnpm -C apps/nexus exec vitest run \
  test/api/admin/analytics/intelligence.get.test.ts \
  test/api/admin/intelligence-agent/session/stream.post.test.ts \
  test/api/admin/intelligence-agent/session/trace.get.test.ts \
  test/api/v1/intelligence/invoke.post.test.ts \
  test/api/v1/intelligence/stream.post.test.ts
corepack pnpm -C apps/nexus typecheck
corepack pnpm -C apps/nexus build
```

## Non-goals

- Disabling test discovery or excluding all `server/api` files from typecheck.
- Weakening intelligence auth, fail-closed quota, stream, or error-redaction behavior.
