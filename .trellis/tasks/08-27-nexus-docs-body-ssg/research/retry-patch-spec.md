# R4 patch spec — bounded retry + inline error state for the SPA-nav docs body fetch

Investigated 2026-08-27 against the working tree (core `DOCS_PAGE_RENDER_BODY_MODE` change
already applied, uncommitted). Nothing under `apps/nexus/` was modified while producing this.

---

## (A) Cache semantics of `docs-page-client-cache.ts`

File: `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/utils/docs-page-client-cache.ts`

### Does a rejection stay in `docsPageRequestPending`?

**No.** `requestDocsPage` builds the chain at lines 168-180:

```ts
  const request = requestJson<DocsPageRecord>('/api/docs/page', { ... })
    .then((value) => {                       // line 174 — fulfilment only
      primeDocsPageRequestCache({ path, locale, body }, value)
      return value
    })
    .finally(() => {                          // line 177 — BOTH outcomes
      if (import.meta.client)
        docsPageRequestPending.delete(cacheKey)
    })

  if (import.meta.client)
    docsPageRequestPending.set(cacheKey, request)   // line 183
```

- `.finally` (line 177-180) runs on rejection as well as fulfilment, so the pending entry is
  deleted when the request fails.
- Ordering is safe: `set` (line 183) is synchronous and the `.finally` callback can only fire in
  a later microtask, so the delete can never precede the set.

### Is anything written to `docsPageRequestCache` on rejection?

**No.** The only two writers are:

- line 175, inside `.then` — fulfilment only;
- line 100, inside `cacheDocsFullBody`, which returns early for a nullish value (line 87).

Neither is reachable from a rejection.

### Would a naive second `requestDocsPage` call return the same rejected promise?

**No.** After the rejection settles, `readCachedDocsPageRequest` (line 158) misses and the pending
lookup (lines 162-166) misses, so a second call issues a genuine new `$fetch`.

### Eviction requirement

**None. No change to `docs-page-client-cache.ts` is required, and nothing new needs exporting.**
The retry loop can call `requestDocsPage({ path, locale, body: '1' })` again as-is.

One caveat that constrains *where* the retry may live: while the first attempt is still
in-flight, a concurrent `requestDocsPage` for the same key gets the **same** promise (line 165).
That is correct dedup, but it means the retry must be sequenced *after* the previous attempt has
settled — which the `await` in the loop below guarantees. Do not fire retries on a timer that can
overlap the in-flight attempt.

### Incidental finding (not fixed here, see (E))

`DOCS_PAGE_REQUEST_CACHE_TTL_MS` caching of a 204 answer is ineffective. ofetch resolves a 204
with `undefined` (see (B)), `primeDocsPageRequestCache` stores `{ value: undefined }`, and
`requestDocsPage` line 159 tests `if (cached !== undefined)` — so the entry never reads back as a
hit and every call re-requests. Harmless for this patch (nothing loops on it), but it means the
30s TTL does not actually suppress repeat requests for body-less documents.

---

## (B) Genuine failure vs. a legitimate empty / 204 answer

**The distinction is settlement mode, not value shape: retry only on rejection.**

Chain of evidence:

1. `server/api/docs/page.get.ts` returns `null` from the handler for a document it cannot
   resolve (lines 42, 120, 145, 175, 179, 259, 269). Nitro serializes a `null` handler return as
   **HTTP 204 with a zero-byte body** — matching the team lead's production probe
   (`/api/docs/page?path=/docs/dev/components/anchor&locale=en&body=1` → 204, 0 bytes).
2. `requestJson` is `$fetch` (`app/utils/request.ts:17-20`), i.e. ofetch **1.5.1** (resolved via
   `node_modules/.pnpm/nuxt@4.4.8_.../node_modules/ofetch -> ofetch@1.5.1`).
3. `node_modules/.pnpm/ofetch@1.5.1/node_modules/ofetch/dist/shared/ofetch.CWycOUEr.mjs:163`
   declares `const nullBodyResponses = new Set([101, 204, 205, 304])`, and line 295 gates all body
   parsing on `!nullBodyResponses.has(context.response.status)`. For a 204 the parse is skipped,
   `response._data` stays `undefined`, and the promise **fulfils with `undefined`**.
4. ofetch only rejects for status ≥ 400 (`FetchError`) or a transport-level failure — connection
   reset, DNS, abort, TLS. Those are exactly the failures the PRD measured (10/265 curl probes
   returning code 000).

Therefore: a "document has no body / does not exist" answer takes the **`try` path**, flows
through `settleFullDoc(cacheDocsFullBody(nextFullDoc))` — where `cacheDocsFullBody` returns early
on the nullish value (line 87) — and `return`s out of the loop. It never reaches `catch`, so it is
never retried and never sets `fullDocError`. Only a rejection reaches `catch`, and only `catch`
retries.

**Do not gate the retry on a falsy/empty response value.** That would turn every legitimately
body-less document into three requests and a false error banner.

---

## (C) The patch

Ordered per file. Each `old` block is verified unique in the current working tree.

### C1 — `apps/nexus/app/pages/docs/[...slug].vue`

#### C1.1 Retry backoff constant (near line 13-15)

old:
```ts
const DOCS_FULL_BODY_IDLE_DELAY_MS = 180
const DOCS_FULL_BODY_IDLE_TIMEOUT_MS = 1200
const DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS = 900
```

new:
```ts
const DOCS_FULL_BODY_IDLE_DELAY_MS = 180
const DOCS_FULL_BODY_IDLE_TIMEOUT_MS = 1200
// Two retries, then the reader gets an error with a retry button instead of a blank page.
// The API behind this is dynamic and has been measured resetting connections on slow links,
// so a single rejection is far more often a flaky hop than an answer.
const DOCS_FULL_BODY_RETRY_DELAYS_MS = [800, 2400] as const
const DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS = 900
```

#### C1.2 Error ref (line 206-207)

old:
```ts
const fullDoc = shallowRef<Record<string, any> | null>(null)
const fullDocLoading = ref(false)
```

new:
```ts
const fullDoc = shallowRef<Record<string, any> | null>(null)
const fullDocLoading = ref(false)
const fullDocError = ref(false)
```

#### C1.3 Retry timer handles (line 215-216)

old:
```ts
let fullDocIdleId: number | null = null
let fullDocTimer: ReturnType<typeof setTimeout> | null = null
```

new:
```ts
let fullDocIdleId: number | null = null
let fullDocTimer: ReturnType<typeof setTimeout> | null = null
let fullDocRetryTimer: ReturnType<typeof setTimeout> | null = null
let fullDocRetryResume: (() => void) | null = null
```

#### C1.4 Cancel the backoff from the one cancellation point (line 226-230)

`if (fullDocTimer) {` occurs exactly once in the file, so this block is unique.

old:
```ts
  if (fullDocTimer) {
    clearTimeout(fullDocTimer)
    fullDocTimer = null
  }
}
```

new:
```ts
  if (fullDocTimer) {
    clearTimeout(fullDocTimer)
    fullDocTimer = null
  }
  if (fullDocRetryTimer) {
    clearTimeout(fullDocRetryTimer)
    fullDocRetryTimer = null
  }
  // Waking the backoff is part of cancelling it: the retry loop is suspended on that promise
  // and can only re-check staleness once it resolves.
  fullDocRetryResume?.()
}

/**
 * Backoff between body-fetch attempts. It hangs off `clearFullDocFetchSchedule` like every
 * other pending timer here so a navigation mid-wait cannot leave the loop suspended past the
 * unmount.
 */
function waitBeforeDocBodyRetry(delay: number) {
  return new Promise<void>((resolve) => {
    fullDocRetryResume = () => {
      fullDocRetryTimer = null
      fullDocRetryResume = null
      resolve()
    }
    fullDocRetryTimer = setTimeout(() => fullDocRetryResume?.(), delay)
  })
}
```

#### C1.5 Retry loop in `loadFullDocForRoute` (lines 245-276, whole function)

old:
```ts
async function loadFullDocForRoute(fetchId: number, path: string, locale: 'en' | 'zh') {
  if (import.meta.server || !shouldSplitDocBody.value)
    return

  const cacheKey = resolveDocsFullBodyCacheKey(path, locale)
  if (hasCachedDocsFullBody(cacheKey)) {
    settleFullDoc(readCachedDocsFullBody(cacheKey) ?? null)
    return
  }

  fullDocLoading.value = true

  try {
    const nextFullDoc = await requestDocsPage({ path, locale, body: '1' })

    if (isStaleDocFetch(fetchId, path, locale))
      return

    settleFullDoc(cacheDocsFullBody(nextFullDoc))
  }
  catch {
    if (!isStaleDocFetch(fetchId, path, locale))
      fullDoc.value = null
  }
  finally {
    // Never leave the spinner up: every exit from the body fetch resolves the view.
    if (!isStaleDocFetch(fetchId, path, locale)) {
      fullDocLoading.value = false
      isLoading.value = false
    }
  }
}
```

new:
```ts
async function loadFullDocForRoute(fetchId: number, path: string, locale: 'en' | 'zh') {
  if (import.meta.server || !shouldSplitDocBody.value)
    return

  fullDocError.value = false

  const cacheKey = resolveDocsFullBodyCacheKey(path, locale)
  if (hasCachedDocsFullBody(cacheKey)) {
    settleFullDoc(readCachedDocsFullBody(cacheKey) ?? null)
    return
  }

  fullDocLoading.value = true

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const nextFullDoc = await requestDocsPage({ path, locale, body: '1' })

        if (isStaleDocFetch(fetchId, path, locale))
          return

        settleFullDoc(cacheDocsFullBody(nextFullDoc))
        return
      }
      catch {
        if (isStaleDocFetch(fetchId, path, locale))
          return

        // Only a rejected request lands here. A document with no body answers 204 and
        // resolves, so it settles above as an answer rather than being retried into the
        // same 204 twice more.
        const retryDelay = DOCS_FULL_BODY_RETRY_DELAYS_MS[attempt]
        if (retryDelay === undefined) {
          fullDoc.value = null
          fullDocError.value = true
          return
        }

        await waitBeforeDocBodyRetry(retryDelay)
      }
    }
  }
  finally {
    // Never leave the spinner up: every exit from the body fetch resolves the view.
    if (!isStaleDocFetch(fetchId, path, locale)) {
      fullDocLoading.value = false
      isLoading.value = false
    }
  }
}
```

Notes for the implementer:

- `DOCS_FULL_BODY_RETRY_DELAYS_MS[attempt]` types as `800 | 2400 | undefined` because nexus
  compiles with `noUncheckedIndexedAccess: true` (`.nuxt/tsconfig.app.json:198`), so
  `retryDelay === undefined` both narrows and typechecks. Do not "simplify" it to a length
  comparison — the `undefined` branch is the loop's only exhaustion exit.
- `for (let attempt = 0; ; attempt++)` with an `await` inside has precedent in this app
  (`app/components/tuff/landing/TuffLandingNexusHero.vue:196`,
  `app/components/docs/DocsAssistantDialog.vue:302`).
- Total requests are bounded at 3 (1 + 2 retries), worst-case wall clock ≈ 3.2s of backoff.

#### C1.6 Manual retry entry point (after `startFullDocFetchForRoute`, lines 313-322)

old:
```ts
function startFullDocFetchForRoute() {
  if (import.meta.server || !shouldSplitDocBody.value || fullDoc.value || fullDocLoading.value)
    return

  if (seedFullDocFromCurrentDoc())
    return

  const fetchId = ++activeDocFetchId
  scheduleFullDocFetchForRoute(fetchId, docPath.value, docsLocale.value)
}
```

new:
```ts
function startFullDocFetchForRoute() {
  if (import.meta.server || !shouldSplitDocBody.value || fullDoc.value || fullDocLoading.value)
    return

  if (seedFullDocFromCurrentDoc())
    return

  const fetchId = ++activeDocFetchId
  scheduleFullDocFetchForRoute(fetchId, docPath.value, docsLocale.value)
}

// A reader who asked for the body already waited out the backoff, so this skips the idle
// scheduling that the automatic path uses and requests immediately.
function retryFullDocFetch() {
  if (import.meta.server || fullDocLoading.value)
    return

  clearFullDocFetchSchedule()
  const fetchId = ++activeDocFetchId
  void loadFullDocForRoute(fetchId, docPath.value, docsLocale.value)
}
```

`fullDocError` is cleared by `loadFullDocForRoute` itself (C1.5, first statement), so it is not
duplicated here — that keeps one owner for the flag across all three entry points (scheduled
fetch, assistant-triggered fetch, manual retry).

#### C1.7 Clear the error on route change (lines 424-425, inside `loadActiveDocForRoute`)

Unique: line 461's `clearFullDocFetchSchedule()` is indented 6 spaces and follows
`fullDocLoading.value = false`; this pair is 2-space indented and precedes it.

old:
```ts
  clearFullDocFetchSchedule()
  fullDocLoading.value = false
```

new:
```ts
  clearFullDocFetchSchedule()
  fullDocLoading.value = false
  fullDocError.value = false
```

#### C1.8 Template — error block where the skeleton is (lines 1989-1996)

Indentation is 10 spaces for the `<div>`, 12 for its children.

old:
```html
          <div v-else class="docs-prose docs-prose-skeleton markdown-body max-w-none prose prose-neutral dark:prose-invert">
```

new:
```html
          <div v-else-if="fullDocError" class="docs-body-error" role="alert">
            <span class="docs-body-error__icon i-carbon-warning" aria-hidden="true" />
            <div class="docs-body-error__content">
              <p class="docs-body-error__title">
                {{ t('docs.bodyErrorTitle') }}
              </p>
              <p class="docs-body-error__desc">
                {{ t('docs.bodyErrorDescription') }}
              </p>
            </div>
            <button type="button" class="docs-body-error__retry" @click="retryFullDocFetch">
              {{ t('docs.bodyErrorRetry') }}
            </button>
          </div>
          <div v-else class="docs-prose docs-prose-skeleton markdown-body max-w-none prose prose-neutral dark:prose-invert">
```

The chain becomes `<template v-if="renderDoc?.body">` → `<div v-else-if="fullDocError">` →
`<div v-else>` (skeleton). `i-carbon-warning` is the icon the not-found state on this same page
already uses (line 2114), and it exists in `@iconify-json/carbon` (verified).

#### C1.9 Styles — insert before `.docs-prose-skeleton` (line 2323)

old:
```css
.docs-prose-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}
```

new:
```css
.docs-body-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
  padding: 14px 16px;
}

.docs-body-error__icon {
  margin-top: 2px;
  font-size: 18px;
  color: color-mix(in srgb, var(--tx-color-warning) 85%, var(--tx-text-color-primary));
}

.docs-body-error__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.docs-body-error__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.docs-body-error__desc {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.docs-body-error__retry {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 88%, transparent);
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  cursor: pointer;
  transition:
    background var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-body-error__retry:hover,
.docs-body-error__retry:focus-visible {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  outline: none;
}

.docs-prose-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}
```

The hover/focus treatment mirrors `.docs-aside-assistant-shell` in `app/layouts/docs.vue:841-846`,
which is the established affordance for a docs-chrome button.

### C2 — `apps/nexus/i18n/locales/en.ts` (lines 511-512)

`backHome:` appears twice in this file (line 54 and line 512), so the old block includes
`notFoundDescription` to be unique.

old:
```ts
    notFoundDescription: 'We could not find content for this route yet. Head back to the docs overview.',
    backHome: 'Back to docs home',
```

new:
```ts
    notFoundDescription: 'We could not find content for this route yet. Head back to the docs overview.',
    backHome: 'Back to docs home',
    bodyErrorTitle: 'Could not load this document',
    bodyErrorDescription: 'The content did not come through. Check your connection and try again.',
    bodyErrorRetry: 'Retry',
```

### C3 — `apps/nexus/i18n/locales/zh.ts` (lines 510-511)

Same uniqueness caveat (`backHome:` also at line 54).

old:
```ts
    notFoundDescription: '当前路径暂未匹配到内容，请返回文档首页。',
    backHome: '返回文档首页',
```

new:
```ts
    notFoundDescription: '当前路径暂未匹配到内容，请返回文档首页。',
    backHome: '返回文档首页',
    bodyErrorTitle: '文档内容加载失败',
    bodyErrorDescription: '内容没有取回来，请检查网络后重试。',
    bodyErrorRetry: '重试',
```

---

## (D) Test assertions invalidated — `apps/nexus/app/pages/docs/docs-page-performance.test.ts`

### D1 — Invalidated by the ALREADY-APPLIED core change (5 assertions, currently failing)

All five are inside `it('caches split full-body docs on the client without deep AST reactivity')`.

| Line | Current assertion | Why it fails |
|---|---|---|
| 720 | `toContain('const shouldRequestMetadataOnlyDocBody = computed(() => shouldSplitDocBody.value)')` | symbol deleted |
| 721 | `toContain("const currentDocsPageBodyMode = computed(() => (shouldRequestMetadataOnlyDocBody.value ? '0' : '1'))")` | symbol deleted |
| 722 | `toMatch(/…:\$\{currentDocsPageBodyMode\.value\}`\)/)` | key now interpolates `DOCS_PAGE_RENDER_BODY_MODE` |
| 746 | `toContain('body: currentDocsPageBodyMode.value')` | query now passes `DOCS_PAGE_RENDER_BODY_MODE` |
| 747 | duplicate of 721 | symbol deleted |

Replacements — for lines 720-722:

old:
```ts
    expect.soft(page).toContain('const shouldRequestMetadataOnlyDocBody = computed(() => shouldSplitDocBody.value)')
    expect.soft(page).toContain("const currentDocsPageBodyMode = computed(() => (shouldRequestMetadataOnlyDocBody.value ? '0' : '1'))")
    expect.soft(page).toMatch(/const currentDocsPageFetchKey = computed\(\(\) => `\$\{DOCS_CURRENT_PAGE_FETCH_KEY_PREFIX\}:\$\{docPath\.value\}:\$\{docsLocale\.value\}:\$\{currentDocsPageBodyMode\.value\}`\)/)
```

new:
```ts
    // Whatever renders the HTML asks for the body with it, so there is no metadata-only
    // mode left to compute — and the hydrating client must send the server's value or the
    // payload key stops matching and the rendered body is discarded into a skeleton.
    expect.soft(page).toContain("const DOCS_PAGE_RENDER_BODY_MODE = '1'")
    expect.soft(page).not.toContain('shouldRequestMetadataOnlyDocBody')
    expect.soft(page).not.toContain('currentDocsPageBodyMode')
    expect.soft(page).toMatch(/const currentDocsPageFetchKey = computed\(\(\) => `\$\{DOCS_CURRENT_PAGE_FETCH_KEY_PREFIX\}:\$\{docPath\.value\}:\$\{docsLocale\.value\}:\$\{DOCS_PAGE_RENDER_BODY_MODE\}`\)/)
```

Replacement — for lines 746-747:

old:
```ts
    expect.soft(page).toContain('body: currentDocsPageBodyMode.value')
    expect.soft(page).toContain("const currentDocsPageBodyMode = computed(() => (shouldRequestMetadataOnlyDocBody.value ? '0' : '1'))")
```

new:
```ts
    expect.soft(page).toContain('body: DOCS_PAGE_RENDER_BODY_MODE,')
```

Line 745 (`key: currentDocsPageFetchKey, … immediate: import.meta.server || !shouldSplitDocBody.value, … watch: false`)
still passes unchanged — `immediate` and `watch` were not touched. Lines 81, 749, 768 (all
`shouldSplitDocBody`-based) also still pass; the split still governs client navigation.

### D2 — Invalidated by this patch

**None.** Every assertion that touches the code I am changing was re-checked against the new
source and still matches:

- 754, 755 (`clearFullDocFetchSchedule` internals) — the new retry-timer block is appended after
  the matched sequences.
- 757 — `fullDocError.value = false` is inserted *before* `const cacheKey = …`, so the
  `cacheKey → hasCachedDocsFullBody → settleFullDoc` order is intact.
- 758 (`fullDocLoading.value = true` … `requestDocsPage({ path, locale, body: '1' })`),
  759 (`settleFullDoc(cacheDocsFullBody(nextFullDoc))`), 903 (same literal call) — all preserved
  verbatim inside the loop.
- 763 (`finally { … isStaleDocFetch … fullDocLoading.value = false … isLoading.value = false }`) —
  the `finally` block is byte-identical and there is still exactly one `finally` in the file.
- 786 (`catch { … fullDocLoading.value = false … clearFullDocFetchSchedule() }`) — the regex spans
  from the first `catch {` (now the loop's) forward into `loadActiveDocForRoute`'s catch, where
  both literals still appear in order.
- 793, 823, 824 (template) — the inserted `v-else-if` sits after the matched `<template v-if>`
  region and before the skeleton `<div v-else>`; neither anchor moved.
- 306/307 (`not.toContain('h(TxButton')`, `not.toContain('<TxLoadingState')`), 304/305 (no tuffex
  imports) — the error block is a plain `<button>`, so these stay green.

`app/utils/docs-page-client-cache.test.ts` only exercises `isDocsPageRecordForRoute` and is
unaffected (the cache file is not modified).

### D3 — New assertions encoding the R4 contract

Append as a new `it` block immediately before the closing `})` of the `describe` (after line 907),
so it sits next to the request-dedup test it depends on.

```ts
  it('retries a failed docs body fetch before surfacing an inline retry affordance', () => {
    expect.soft(page).toContain('const DOCS_FULL_BODY_RETRY_DELAYS_MS = [800, 2400] as const')
    expect.soft(page).toContain('const fullDocError = ref(false)')
    expect.soft(page).toContain('let fullDocRetryTimer: ReturnType<typeof setTimeout> | null = null')
    expect.soft(page).toContain('let fullDocRetryResume: (() => void) | null = null')
    // The backoff is cancelled through the same schedule clearer as every other pending
    // timer here, so a navigation mid-wait cannot leave the loop suspended past unmount.
    expect.soft(page).toContain('function waitBeforeDocBodyRetry(delay: number)')
    expect.soft(page).toMatch(/if \(fullDocRetryTimer\) \{[\s\S]*clearTimeout\(fullDocRetryTimer\)[\s\S]*fullDocRetryTimer = null[\s\S]*\}[\s\S]*fullDocRetryResume\?\.\(\)/)
    // Every attempt re-checks staleness first, so an abandoned route still stops silently.
    expect.soft(page).toMatch(/catch \{[\s\S]*if \(isStaleDocFetch\(fetchId, path, locale\)\)[\s\S]*return/)
    // Only a rejection retries: a document with no body answers 204 and resolves, so it must
    // settle as an answer instead of costing three requests and a false error banner.
    expect.soft(page).toContain('const retryDelay = DOCS_FULL_BODY_RETRY_DELAYS_MS[attempt]')
    expect.soft(page).toMatch(/if \(retryDelay === undefined\) \{[\s\S]*fullDoc\.value = null[\s\S]*fullDocError\.value = true[\s\S]*return[\s\S]*\}[\s\S]*await waitBeforeDocBodyRetry\(retryDelay\)/)
    expect.soft(page).toContain('function retryFullDocFetch()')
    expect.soft(page).toMatch(/function retryFullDocFetch\(\) \{[\s\S]*clearFullDocFetchSchedule\(\)[\s\S]*const fetchId = \+\+activeDocFetchId[\s\S]*void loadFullDocForRoute\(fetchId, docPath\.value, docsLocale\.value\)/)
    expect.soft(page).toMatch(/clearFullDocFetchSchedule\(\)\n  fullDocLoading\.value = false\n  fullDocError\.value = false/)
    expect.soft(page).toContain('v-else-if="fullDocError"')
    expect.soft(page).toContain('class="docs-body-error"')
    expect.soft(page).toContain('@click="retryFullDocFetch"')
    expect.soft(page).toContain("{{ t('docs.bodyErrorRetry') }}")
    expect.soft(i18nEn).toContain("bodyErrorRetry: 'Retry'")
    expect.soft(i18nZh).toContain("bodyErrorRetry: '重试'")
  })
```

No behavioural test is proposed: the failure path needs a real rejecting `/api/docs/page`, and
there is no component-mount harness for this page in the suite (it is a source-literal suite).
The acceptance criterion for the runtime behaviour stays the PRD's manual offline check.

---

## (E) Unresolved risks

1. **A body-less document still shows an infinite skeleton, and this patch does not fix it.**
   Per (B), a 204 resolves with `undefined`; `settleFullDoc(undefined)` leaves `fullDoc.value`
   nullish, `renderDoc` falls back to the metadata stub, `renderDoc?.body` is falsy, and
   `fullDocError` is false — so the template lands on the skeleton `v-else` forever. That
   contradicts the "never an infinite skeleton" invariant, but it is **pre-existing** and its
   fix is a third settled state (empty-body), not retry or error, so it is out of this task's
   scope. Reachable only when the metadata answer carries a record whose body is empty; a
   document that does not exist at all 204s the metadata request too and correctly renders the
   existing not-found state. Recommend filing separately.
2. **`waitBeforeDocBodyRetry` keeps a single module-local resume slot.** Two concurrent retry
   loops on one page instance would have the second overwrite the first's `fullDocRetryResume`,
   orphaning the first loop's promise. I could not construct that case: `loadFullDocForRoute` is
   only entered when `fullDocLoading` is false, and it sets the flag synchronously before the
   first `await`; `startFullDocFetchForRoute` and `retryFullDocFetch` both guard on the same
   flag. If a future caller bypasses that guard, this becomes a real leak. Noted rather than
   defended against, per "no test for a state that cannot be constructed".
3. **`role="alert"` fires an assertive announcement.** Correct for a failure the reader must act
   on, but it interrupts a screen reader mid-sentence. `role="status"` (as `docs-loading-state`
   uses) would be politer. I chose `alert` because the body never arrives without the user
   clicking; flag it if the team prefers the softer role.
4. **Not verified at runtime.** A production build was running throughout, so nothing here was
   type-checked, linted, or executed. The implementer must run
   `pnpm -C "apps/nexus" run typecheck` and
   `pnpm -C "apps/nexus" exec vitest run app/pages/docs/docs-page-performance.test.ts`
   after applying, plus `git diff --check`.
5. **`DocsSidebar.vue` needs no change and is not affected.** Its two `requestDocsPage` calls
   (lines 438 and 453) both end in `.catch(() => {})`, and this patch adds no retry inside
   `requestDocsPage` itself — the loop lives entirely in the page. Sidebar prefetch keeps its
   current fire-and-forget, single-attempt behavior, and test assertions 674-693 and 904-906
   stay green.
