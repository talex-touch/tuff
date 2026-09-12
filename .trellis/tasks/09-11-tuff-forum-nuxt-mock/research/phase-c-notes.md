# Phase C notes — data model, seed, stores, persistence, unit tests

Recorded 2026-09-11 by the implement agent. Everything below was observed in this session; commands are reproducible from `/Users/tagzixian/Workspace/Projects/tuff-forum`. Nothing committed anywhere (per dispatch).

## Outcome

- Phase C complete. `pnpm test` → `Test Files 5 passed (5)`, `Tests 85 passed (85)`; `pnpm typecheck` → exit 0, 0 `error TS` lines; `pnpm lint` → exit 0; `grep -rn "Math.random" app/` → empty; `git diff --check` → exit 0.
- Files untouched, as instructed: `modules/`, `nuxt.config.ts`, `uno.config.ts`, `app/app.vue`, `app/pages/index.vue`. No type error forced a change to any of them.
- Persistence was additionally verified end-to-end in the real app (dev server + headless Chrome, throwaway probe page, removed afterwards) — see "Runtime evidence".

## Files created (all under `/Users/tagzixian/Workspace/Projects/tuff-forum`)

| File | Lines | Role |
|---|---|---|
| `app/data/types.ts` | 130 | Entities per design §4.1 + `Counters`, `FORUM_STATE_VERSION = 1` |
| `app/data/prng.ts` | 56 | `mulberry32(seed)` → `{ next, int, pick, shuffle, chance }` |
| `app/data/seed-content.ts` | 1184 | Hand-written Chinese content: 12 users, 8 categories, 16 tags, 48 topics with Markdown bodies, 48 reply snippets |
| `app/data/seed.ts` | 413 | `createSeed(now)`, `SEED_VALUE`, `DEFAULT_SESSION`, `topicSlug()`, `excerpt()` |
| `app/data/mentions.ts` | 20 | `extractMentions(markdown)` — one `@username` definition shared by seed, store and tests (**addition**, see deviations) |
| `app/data/permissions.ts` | 63 | `can(user, action, ctx)`, `isStaff(user)`, `ForumAction` |
| `app/data/persist.ts` | 62 | `STATE_KEY`, `SESSION_KEY`, `serializeState/parseState`, `serializeSession/parseSession` |
| `app/stores/forum.ts` | 673 | `useForumStore` (Pinia setup store) |
| `app/stores/session.ts` | 36 | `useSessionStore` |
| `app/plugins/persist.client.ts` | 58 | localStorage hydrate + debounced `$subscribe` save |
| `tests/seed.test.ts` | 246 | 19 tests |
| `tests/forum-store.test.ts` | 647 | 46 tests (43 forum + 3 session) |
| `tests/permissions.test.ts` | 84 | 8 tests |
| `tests/persist.test.ts` | 69 | 8 tests |
| `tests/mentions.test.ts` | 28 | 4 tests |

## Final seed sizes (`createSeed(1_780_000_000_000)`; identical for any `now` except timestamps)

```
users 12 (talex=admin u1, mika=moderator u2, 10 members)   categories 8   tags 16
topics 48 (pinned: t1 t2; closed: t4 t5 t42; 8 topics with zero replies)
posts 221 = 48 first posts + 173 replies
  47 replies contain a real @mention, 36 have replyToPostId, 10 have editedAt, 648 likes total
  views 20..4000, topic age 0.2..360 days, 0 timestamps at/after now
notifications 32 = reply 14 / like 8 / mention 4 / follow 4 / system 2; 15 unread (admin: 5 total, 2 unread)
bookmarks 10   follows 16
counters { topic: 48, post: 221, notification: 32 }
```

Category icons (all verified present in `@iconify-json/carbon/icons.json`, 2763 icons): `i-carbon-notification help idea plug code chat debug document`. `i-carbon-bug` confirmed absent, so 缺陷反馈 uses `i-carbon-debug`.

## Store API surface

`useForumStore()` returns, in this order:

- state: `state` (the `ForumState` ref)
- lookups: `topicById postById postsOfTopic firstPostOf isFirstPost userById userByUsername categoryById categoryBySlug tagById tagBySlug`
- topic-level: `replyCount likeCountOfTopic participants topicCountOfCategory topicCountOfTag sortedTopics({mode,categoryId?,tagId?}) recentTopicsOfCategory(id,n) suggestedTopics(id,n=5) searchAll(q)`
- notifications / bookmarks / follows: `notificationsOf unreadCount bookmarksOf isBookmarked isFollowing`
- per-user: `topicsOfUser repliesOfUser statsOfUser topLikedPostsOfUser(id,n=5) topTopicsOfUser(id,n=5) mostLikedByUsers(id,n=6) activityOfUser(id,n=30)`
- mutations: `createTopic createPost editPost deletePost toggleLike toggleBookmark toggleFollow setPinned setClosed incrementViews markRead markAllRead updateProfile replaceState reset(now?)`

Exported types: `TopicSortMode TopicFilter CreateTopicInput CreatePostInput ProfilePatch SearchResults BookmarkEntry UserStats LikerSummary ActivityKind ActivityEvent`.

`useSessionStore()`: `currentUserId currentUser isLoggedIn isStaff login(userId): boolean logout()`. Default `currentUserId = 'u1'` (talex, admin).

Every mutation takes an optional trailing `at` / `input.at` timestamp (defaults to `Date.now()`), so tests pin time without mocking the clock. `toggleLike/toggleBookmark/toggleFollow` return the **new** state (`true` = now liked/bookmarked/following); `deletePost/editPost/updateProfile` return `boolean` success.

Getters that hand back store objects return the **reactive proxies** (a `pushReactive` helper appends and returns `list[list.length-1]`), so `expect(forum.postsOfTopic(t).at(-1)).toBe(createdPost)` holds and pages can compare by identity.

## Persistence choice

- Keys `tuff-forum:state:v1` / `tuff-forum:session:v1` (version embedded via `FORUM_STATE_VERSION`).
- Plugin `persist.client.ts` is an object plugin with `dependsOn: ['pinia']` (the `@pinia/nuxt` plugin is named `pinia`; Nuxt's typed `pluginName` union accepts it). It hydrates both stores, then `$subscribe(..., { detached: true })` with `useDebounceFn(save, 150)` from `@vueuse/core`.
- **`reset()` only replaces `state`**; there is no explicit `localStorage.removeItem`. The subscription fires on the replacement and overwrites the key with the fresh seed within 150 ms. Verified at runtime (run 7/8 below). Trade-off: closing the tab within 150 ms of a reset keeps the old state — acceptable for a mock.
- Every storage access is inside try/catch; `parseState` returns `null` on JSON error, wrong version, missing `seededAt`/`counters`, or any of the 8 collections not being an array — the store then keeps its fresh seed. Nothing at startup can throw.
- A stale `currentUserId` that no longer resolves (e.g. after reseeding with different users) reads as guest (`currentUser === null`), not as a crash.

## Deviations from design §4 / the dispatch (and why)

1. **`app/data/mentions.ts` added** (not in the file list). The dispatch had the store scan `@username` itself; the first regex (`/@([a-z0-9_-]+)/`) matched `@talex-touch/tuffex`, `tuffex@0.5.0` and `@click` inside seed code blocks, which the seed test exposed (`p155: @click`). One shared extractor now strips fenced/inline code and requires a non-word left boundary and a non-`/@-` right boundary; seed, store and tests all import it.
2. **`Post` returned from `createPost` / `createTopic` is the reactive proxy, not the raw literal.** Necessary for `toBe` identity between what an action returns and what a getter later serves; the raw literal would silently break `===` in pages.
3. **`topLikedPostsOfUser` ranks replies only** (first posts are excluded); first posts are ranked by `topTopicsOfUser`. That matches Discourse's summary tab (热门回复 vs 热门话题) and avoids the same post showing in both lists.
4. **`suggestedTopics` fills from other categories** when the same category runs short (dispatch asked for this; design §4.3 only said same-category). Tested.
5. **Notification preferences are honoured**: `createPost` / `toggleLike` / `toggleFollow` skip the notification when the recipient's `notifyPrefs.{reply,like,follow}` is `false`. Design listed `notifyPrefs` on the user but did not say who reads it; without a consumer the preferences page would be decorative.
6. **`Category.icon` / `Tag.color` / `User.avatarColor` are hex strings**; `AVATAR_PALETTE` (8 colours) is exported from `seed-content.ts` for the preferences page's avatar presets.
7. **Seed content sizes**: 48 topics (dispatch: ≥45), 221 posts (~220), 32 notifications (~30), 10 bookmarks (~10), 16 follows (~20; two dice rolls per user, kept as generated rather than forced — the `≥12` test bound documents it). 48 reply snippets (≥40), two of which mention a fixed user (`@mika`, `@talex`) so mention notifications exist that are not also reply notifications.
8. **Timestamps in the seed use `now - offset` but are clamped**: reply gaps shrink so every thread fits before `now`; nobody posts, likes or follows before their `joinedAt` (bruce joined 40 days ago, so his topics are ≤39 days old regardless of the PRNG roll). Tested.
9. **Quota constants are typed `Record<…, number>`** rather than `as const`: with literal types TS 5.9 flags `budget === 0` as "no overlap" (TS2367) after decrement.
10. **Two seed-content edits for Phase H's guard**: a topic title/body that literally quoted `:style="…"` was reworded to prose, because `check-styles.mjs` will grep every source file for `:style=`. `app/` now contains no `<style`, `style=`, `:style` or `Math.random` token, including inside Markdown strings and comments.

## Runtime evidence (dev server + headless Chrome, throwaway `app/pages/__probe.vue`, removed afterwards)

Probe page called `incrementViews('t1')` on mount, waited 600 ms, then printed `localStorage` sizes. Same Chrome profile across runs; zero `[Vue warn]` / `Uncaught` / `Failed to resolve` lines in every run; dev-server log had no warn/error lines.

```
run1 cold   : topics=48 posts=221 seededAt=1789131648447 views=4001 stored=65813 chars user=talex
run2 warm   : seededAt unchanged, views=4002  → state hydrated from localStorage and re-saved
run3 ?login=u3 : session={"currentUserId":"u3"} userNow=ryan
run4 plain  : userAtMount=ryan            → session hydrated
run5 ?logout: session={"currentUserId":null} userNow=guest
run6 plain  : userAtMount=guest           → guest state persisted
run7 ?reset : seededAtMount=…648447 seededAtNow=…700743 views=4001 → reset() replaced state
run8 plain  : seededAtMount=…700743 views=4002 → the subscription overwrote the key with the new seed (no explicit clear needed)
```

(`t1` is the pinned welcome topic whose seeded views clamp at 4000, hence 4001.)

## Mutation testing of the guards (each mutant → red → reverted; clean run 85/85 after each restore, `diff` against backups empty)

| Mutant | Failing tests |
|---|---|
| `mulberry32(Math.random()…)` in `createSeed` | 4 |
| `deletePost` allows the first post | 1 |
| like notification not de-duplicated | 1 |
| pinned-first dropped from `sortedTopics` | 2 |
| reply notification sent to self | 2 |
| `parseState` ignores `version` | 1 |
| `can()` lets members reply to closed topics | 1 |

## Tooling observations for later phases

- `vitest` (3.2.7) resolves `~/…` through `vitest.config.ts`'s alias and never touches `.nuxt`; the store files import `defineStore` from `pinia` and `ref/computed` from `vue` explicitly, so no Nuxt auto-import shim is needed in tests. `tests/` is **not** in any Nuxt tsconfig project (`tsconfig.app.json` includes `tests/nuxt/**` only), so `pnpm typecheck` does not type-check test files. A one-off `vue-tsc --noEmit` with a temp tsconfig extending `.nuxt/tsconfig.app.json` and including `tests/**` passed with 0 errors (temp file deleted). Phase H may want to make that permanent.
- `@nuxt/eslint`'s stylistic preset is on: `@typescript-eslint/no-dynamic-delete` fired once in a test (`delete obj[key]`), replaced with `Object.fromEntries(...filter)`. `import/no-mutable-exports` and `no-unused-vars` (allow `_`-prefix) are the other rules that bit during probing.
- Headless Chrome on macOS never exits on its own after `--dump-dom` when the page keeps a Vite HMR socket open; the probe script polled for the DOM marker and `pkill`ed by the profile path (memory: core-app-component-screenshot-without-cdp). Reuse the same pattern in `scripts/smoke-routes.mjs`.
- `$subscribe` in Pinia 4 fires for direct `state.value = …` replacement as well as nested mutations (run 7/8 proves it), so `replaceState`/`reset` need no manual save call.
