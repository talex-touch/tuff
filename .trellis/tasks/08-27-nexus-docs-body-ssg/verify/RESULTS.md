# Runtime verification results

## Run 1 — core change only (retry/error state not yet built into `dist`)

2026-08-27, `wrangler pages dev` on `apps/nexus/dist` built from the core change,
Chrome 151. Command: `node verify-docs-ssg.mjs --base-url=http://127.0.0.1:8788`.

**18 passed, 0 failed, 2 not-implemented.** Exit 0.

The load-bearing results, against `/en/docs/dev/components/button/` (chosen because it is
the most demo-heavy doc, i.e. the highest hydration risk):

| Check | Result |
| --- | --- |
| `C2.raw-html` | served HTML contains **9** `<h2>` before any JS runs |
| `C2.no-js-dom` | **with JavaScript disabled**: 9 `<h2>`, 1 `<pre>`, 9,261 chars of prose |
| `C2.no-skeleton` | the JS-free render shows no body skeleton |
| `C1.no-body-fetch` | **zero** `/api/docs/page` requests in the 5s after load |
| `C1.capture-live` | 125 requests were captured overall (the capture was live) |
| `C1.control` | a deliberate `/api/docs/page` request WAS caught by the same matcher |
| `C3.body-survived` | hydration preserved all 9 headings from the SSR body |
| `C3.no-vue-warnings` | no Vue hydration warnings (+ control: a synthetic `[Vue warn]` WAS caught) |
| `C4.spa-nav` | in-page navigation was a real client-side route change, not a reload |
| `C4.body-fetched` | 2 `/api/docs/page` requests fired after the click — lazy body load intact |
| `C4.control` | the new doc's headings differ from the previous doc's (not stale DOM) |

`C2.no-js-dom` is the one that settles the original complaint: the docs are now readable
with scripting off, which means they no longer depend on a second round trip that was
measured at 1.4–5s and intermittently failing.

`C3.body-survived` is the one that clears the design's main risk: the payload key still
matches between prerender and hydration, so the server-rendered body is kept rather than
discarded into a skeleton. Demo components on this page produced no hydration warnings.

### Expected pendings

`C5.error-state` and `C5.retry-recovers` reported PEND: with `/api/docs/page` blocked, an
SPA navigation leaves the page with no error state and no retry control (rendered `<h2>`:
0). That is the pre-existing defect this task's resilience half fixes; the `dist` under
test predates it. `C5.control` confirmed 1 request was genuinely blocked, so the PEND is a
real observation and not a harness failure.

## Run 2 — with retry + error state: 20 passed, 0 failed, 0 not-implemented

Re-run after the host recovered memory (swap had been exhausted; Chrome was dying with
SIGABRT). Build rebuilt from the exact current source first, so `dist` provably matches
what is reported here.

Everything from run 1 stayed green, and the two pendings closed:

| Check | Result |
| --- | --- |
| `C5.control` | 4 `/api/docs/page` requests actually blocked — 1 initial + 2 retries + 1 sidebar prefetch, i.e. the bounded retry ran |
| `C5.error-state` | an error state with a retry affordance appeared: **"Retry"**, alert text "Could not load this document / The content did not come through. Check your connection and try again." |
| `C5.retry-recovers` | clicking retry rendered the body (6 `<h2>`) once the API was reachable |

### Two defects the C5 check found before it could pass

**1. The harness blocked too much.** It blocked `*/api/docs/page*`, which takes out the
`body=0` metadata request as well as the `body=1` body request. A client-side navigation
asks for metadata first, so blocking both exercised the metadata failure path — an
existing settled not-found state — and never reached the body-fetch retry. Fixed to block
`body=1` only, and verified in-page immediately before the navigation that `body=0`
returns 200 while `body=1` rejects, so the narrowed pattern is doing exactly what it
claims.

**2. A real page defect, pre-existing, that made the new error state unreachable.**
With only the body blocked, the page still showed **"Document not found"** for a document
that exists — captured from the DOM at t≈1s through t≈16s, with no skeleton and no error
block. Cause: `startFullDocFetchForRoute` ran `++activeDocFetchId`, and it fires from
`onMounted`, which lands between `loadActiveDocForRoute`'s own bump and its awaited
metadata response. The response therefore tested stale and `doc.value = nextDoc` never
ran. Normally invisible, because a successful body fetch backfills `doc` through
`settleFullDoc`; when the body fetch fails there is nothing to backfill it, `viewState`
falls to `not-found`, and the error state — which lives inside the `content` branch —
cannot render. Fixed by reading the generation instead of bumping it: this call is a
follow-on for the navigation already in flight, not a new one. Pinned by a line-scoped
assertion with a negative control (reverting to `++` turns it red).
