# Design — Clipboard credential and software labels

## Data flow

```text
text capture ───────────────────────────────────────────┐
                                                          ├─ detectClipboardTags → tags + tag_search_terms → Clipboard History UI/query
clipboard image → host-owned system OCR → recognized text ┘
```

`apps/core-app/src/main/modules/clipboard-tagging.ts` remains the single classifier. It receives bounded text and returns ordered, non-secret labels plus search aliases. The capture pipeline persists both values as ordinary clipboard metadata. The host-owned OCR service invokes the same classifier after OCR succeeds and transactionally merges both arrays with existing metadata.

Clipboard image jobs no longer pin a language hint to English. The native worker forwards no hint, allowing macOS Vision to use its installed/default recognition language behavior and Windows OCR to use the current user profile language behavior. Existing persisted jobs with an explicit historical language retain it.

The Clipboard History plugin reads the existing `PluginClipboardItem.meta.tags` projection and formats labels locally; it receives no new transport payload and does not inspect raw credential formats.

## Contracts

- `ClipboardTag` remains the canonical union and order. Labels classify an observed format or explicit software mention; they do not establish validity, ownership, or application provenance.
- Credential platform patterns require full, provider-specific prefixes and bounded character forms. Generic `sk_` is intentionally not classified without an unambiguous provider prefix.
- WeChat classification requires `@wx`, `@wechat`, or `微信`; it emits the `wechat` tag and aliases `wx`, `wechat`, and `微信` for metadata keyword search.
- OCR update merges `tags` and `tag_search_terms` set-wise with persisted metadata. OCR writes must not erase capture tags, source metadata, or OCR fields.
- Only labels and aliases are added to `clipboard_history.metadata` and `clipboard_history_meta`; no derived credential value, prefix fragment, hash, logging field, or outbound request is introduced.

## UI

- List rows show a compact, bounded tag strip only when tags exist.
- Detail view shows the same labels as read-only metadata.
- Unknown future tags degrade to the tag string; historical no-tag records show no extra UI.

## Verification

- Detector cases: GitHub, npm, OpenAI, Stripe, Google, AWS, Slack, WeChat aliases, plus generic and ambiguous near-matches.
- OCR persistence case: OCR tag/alias merge preserves capture tags and aliases.
- Query case: clipboard metadata keyword matching reaches stored aliases.
- New image/file jobs omit the English language pin; the worker preserves an absent hint.
- Plugin helper/component case: known labels, unknown label, absent labels.
- Focused Vitest, CoreApp node typecheck, plugin build, and `git diff --check`.
