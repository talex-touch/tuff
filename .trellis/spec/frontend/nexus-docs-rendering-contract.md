# Nexus Docs Rendering Contract

Rules for `apps/nexus/app/pages/docs/[...slug].vue` and the prerender pipeline behind it.
Established 2026-08-27 after every docs page was found shipping an empty shell in
production.

---

## The contract

**Anything that renders docs HTML fetches the body with it.** Server render and prerender
must request `/api/docs/page` with `body=1`, and the hydrating client must send the same
value. Splitting metadata from body is allowed only for client-side navigation, which
runs through `loadActiveDocForRoute`.

This is enforced by `const DOCS_PAGE_RENDER_BODY_MODE = '1'`, which feeds both
`currentDocsPageFetchKey` and the `useTypedFetch` query.
`app/pages/docs/docs-page-performance.test.ts` pins it.

### Why it must not be re-split

A metadata-only server fetch makes the prerendered page a shell whose text arrives over a
second round trip. Measured from a mainland-China network to the Cloudflare edge, that
trip cost 1.4–5s and failed outright on roughly 4% of attempts (10 of 265 probes returned
curl code 000). `/api/docs/page` is `cf-cache-status: DYNAMIC` — worker plus D1 on every
request, no edge cache — so the cost is paid per reader, per page. Crawlers received the
same empty shell.

A previous attempt to fix this by prerendering the API payloads (`af99441e0`) was reverted
in `88df316b7` because its routes carried query strings, and query strings cannot
materialize as distinct static files on Pages. That constraint says nothing about
embedding the body in the page HTML, which is what this contract requires. Do not cite the
revert as precedent against it.

### The payload key is load-bearing

The body mode is baked into the `useAsyncData` key
(`docs-current-page:<path>:<locale>:<mode>`) and therefore into `__NUXT_DATA__`. If the
hydrating client computes a different mode than the server used, the payload lookup
misses, `doc` starts null, `loadActiveDocForRoute` sees `hasResolvedDoc === false` and
blanks it, and the server-rendered body is discarded into a skeleton — strictly worse than
not rendering it at all. Any change to how that mode is derived must keep server and
hydration in agreement.

### Suppression of the client fetch is body-presence-driven

Both client entry points — the setup-time `loadActiveDocForRoute()` and the `onMounted`
`startFullDocFetchForRoute()` — short-circuit through `seedFullDocFromCurrentDoc()`, which
adopts `doc.value.body` when it exists. Nothing needs a hydration flag: put the body in the
payload and both paths stop issuing requests. Keep that property when refactoring either
path.

---

## Failure handling for the client-side body fetch

`loadFullDocForRoute` retries a rejected fetch twice (`DOCS_FULL_BODY_RETRY_DELAYS_MS =
[800, 2400]`), then sets `fullDocError` and renders an inline error with a retry button.
Two rules:

1. **Retry on rejection only, never on a falsy value.** The API returns `null` for a
   document it cannot resolve, which Nitro serializes as HTTP 204; ofetch treats 204 as a
   null-body response and *fulfils with `undefined`*. Gating retry on emptiness would turn
   every legitimately body-less document into three requests and a false error banner.
2. **Re-check `isStaleDocFetch` on both sides of the backoff.** Cancelling the schedule
   resolves the wait early on purpose, so without a check after the `await` the loop
   resumes and fires a request for a route the reader already left.

Never leave the view unsettled: every exit from the body fetch clears `fullDocLoading` and
`isLoading`.

3. **`startFullDocFetchForRoute` reads `activeDocFetchId`; it must not bump it.** It fires
   from `onMounted`, which lands between `loadActiveDocForRoute`'s bump and its awaited
   metadata response. Bumping made that response test stale, so `doc` was never assigned
   and the page relied on the body fetch backfilling it through `settleFullDoc`. That hid
   the problem until a body fetch failed — at which point the reader was told **"Document
   not found"** for a document that exists, and the error state, which lives inside the
   `viewState === 'content'` branch, could not render at all. Only a new navigation starts
   a new generation.

### Known gap

A document whose metadata resolves but whose body answers 204 still lands on the skeleton
forever — `fullDocError` stays false because nothing rejected. Pre-existing; fixing it
needs a third settled state (empty-body), not more retry.

---

## Page weight

Bodies ship twice: as rendered DOM and as JSON inside `__NUXT_DATA__`, because hydration
needs the data. Measured across 560 docs pages: p50 41 KB, p90 70 KB, max 218 KB raw; the
max page is 20.5 KB gzip / 14.9 KB brotli, which is what Cloudflare serves. `dist` grew
70 MB → 83 MB with the file count unchanged at 3139, far under the Pages limits (20,000
files, 25 MiB per file). Prerender did not get slower. If page weight ever needs to come
down, the lever is the duplicate payload, not the rendered body.

---

## Verifying a change here

`.trellis/tasks/08-27-nexus-docs-body-ssg/verify/` holds a CDP harness for this contract:
initial load issues zero `/api/docs/page` requests, the JS-disabled DOM already contains
the prose, hydration preserves it, SPA navigation still lazy-loads, and a blocked fetch
surfaces a retry. Every check has a positive control, because the dangerous failure mode
is a harness that observes nothing and reports a pass. Run `self-test.mjs` before trusting
a result.
