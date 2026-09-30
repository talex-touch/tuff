# Research: consumers

- **Query**: Find every call site of `TxStreamMarkdown` / `TxCodeStream` / `TxConversationStream` / `TxTextMorph` outside their own component directories; document which props are used and how content is fed to each.
- **Scope**: internal (whole-repo grep, excluding each component's own `packages/tuffex/packages/components/src/<dir>/` and excluding `**/__tests__/**`, `node_modules`, `dist`, `.nuxt`, `.output`, `.wrangler`)
- **Date**: 2026-09-29

## Summary

| Component | Real production consumer (`apps/core-app`) | TuffEx-internal wrapper consumer | Nexus demo/gallery consumer | Docs-prose-only mentions |
|---|---|---|---|---|
| `TxStreamMarkdown` | **Yes** — `HomePage.vue`, 2 call sites | None (an internal component, `TxChainOfThought`, explicitly does its **own** markdown pass instead of reusing it) | 6 files | Many (`ai-suite`, `code-stream`, `markdown-view`, `reasoning-disclosure`, `template-*` docs) |
| `TxCodeStream` | **None found** | None | 8 files | Many (`ai-suite`, `template-agent-chat`, `template-automation`, `template-release`) |
| `TxConversationStream` | **Yes** — `HomePage.vue`, 1 call site | Type-only, in a drift-contract test (`instance-drift.contract.ts`) | 3 files | `ai-suite`, `template-agent-chat`, `conversation-stream` own docs |
| `TxTextMorph` | **Yes** — `VoiceInsights.vue`, 2 call sites (+ 1 test assertion) | **Yes** — `TxBadge.vue`, `TxTextTransformer.vue` (direct); `TxModeChip.vue`, `TxStatusHint.vue`, `TxSwitch.vue` (indirect, via `TxTextTransformer`) | 11 files | Many (`badge`, `stat-card`, `template-shell`, `template-dashboard`, `template-release`, `auto-sizer`, `status-hint`, `text-transformer`, `changelog`) |

`plugins/` (24 packages) has **zero** references to any of the four components — confirmed by the same whole-repo grep.

`apps/nexus` has no production/non-docs feature that consumes any of the four; every Nexus hit is either a docs page (`content/docs/dev/components/*.mdc`), a gallery specimen (`DocsComponentsGallery.vue`), or a template demo (`content/demos/*.vue`).

---

## `TxStreamMarkdown`

### Real consumer: `apps/core-app/src/renderer/src/views/base/home/HomePage.vue`

Imported at `apps/core-app/src/renderer/src/views/base/home/HomePage.vue:25`:
```
import { TxCodeBlock, TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
```

Two call sites in the same `v-for` message loop, both feeding `content` from a source that is a **plain reactive string containing the full document received so far**, not a delta/chunk — matching the "full re-lex every delta" contract documented in `research/prior-decisions.md`:

1. `HomePage.vue:1544-1550` — inside the per-segment loop (parts/segments model):
   ```
   <TxStreamMarkdown
     v-else-if="segment.kind === 'text'"
     class="HomePage-Reply"
     :content="segment.text"
     :streaming="segment.streaming"
     v-bind="markdownLabels"
   />
   ```
   `segment.text` is `part.text` — the accumulator's current full value for that text part (`apps/core-app/src/renderer/src/modules/conversation/chain-steps.ts:151`), not an incremental chunk. `segment.streaming` is `streaming && index === lastIndex` (`chain-steps.ts:155`) — only the last part of the array is ever marked as actively streaming, so only one `TxStreamMarkdown` instance per message can be in "streaming" visual mode at a time, and only while it is also the last emitted part.

2. `HomePage.vue:1616-1622` — the fallback path for a message that never entered the parts/segments model:
   ```
   <TxStreamMarkdown
     v-if="!message.parts && message.content"
     class="HomePage-Reply"
     v-bind="markdownLabels"
     :content="message.content"
     :streaming="message.status === 'streaming'"
   />
   ```
   Here `content` is the whole-message `content` string and `streaming` is derived from the message's own `status` field, not from a segment. The two call sites are mutually exclusive by construction (`v-else-if`/`v-if` on `!message.parts`), so a given message renders through exactly one of them — see `research/prior-decisions.md` §5 for why this branch is guarded on `!message.parts` rather than on segment count.

Both call sites pass `v-bind="markdownLabels"`, a computed object of five i18n label strings (`blockedImageText`, `loadImageOnceText`, `allowSessionImagesText`, `copyTableText`, `copiedTableText`) defined at `HomePage.vue:1056-1062`. Neither call site passes the `renderers` prop — HomePage uses `TxStreamMarkdown`'s built-in fence rendering only, and separately imports `TxCodeBlock` from the same module (used elsewhere, not as a `renderers` override).

`HomePage.vue:1068` calls `resetRemoteImagePolicy()` on every `conversationId` change — the direct call site for the module-level remote-image consent state documented in `research/prior-decisions.md` §7.

### Non-consumer of note

`packages/tuffex/packages/components/src/chain-of-thought/src/TxChainOfThought.vue:62` and `:168` explicitly describe running "a local marked+DOMPurify pass rather than TxStreamMarkdown" for rendering reasoning-step bodies — i.e. `TxChainOfThought` is a sibling markdown consumer in the same message template but was deliberately **not** built on top of `TxStreamMarkdown`. `packages/tuffex/packages/components/src/markdown-view/src/github-markdown.css:9` documents that `TxMarkdownView` and `TxStreamMarkdown` share the same `tx-md` CSS marker class and the same vendored stylesheet — a styling-level coupling, not a component-wrapping relationship.

### Nexus demo/gallery consumers

| File | Notes |
|---|---|
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue:3920` | `<TxStreamMarkdown :content="markdownSample" />` — static content, no `streaming` prop (non-streaming gallery specimen) |
| `apps/nexus/app/components/content/demos/StreamMarkdownStreamMarkdownDemo.vue:60` | `<TxStreamMarkdown :content="content" :streaming="streaming" />` — the component's own canonical demo |
| `apps/nexus/app/components/content/demos/TemplateAgentChatDemo.vue:1682` | Composed inside a full agent-chat template demo |
| `apps/nexus/app/components/content/demos/TemplateAgentChatCopilotDemo.vue:1897` | Same, Copilot-styled variant |
| `apps/nexus/app/components/content/demos/TemplateResearchDemo.vue:1315,1403` | Two call sites: one for a streamed comparison table, one for a streamed answer; file comment at line 9 notes citations can't live inside it because it renders via `v-html` |

### Prop contract (for reference)

`packages/tuffex/packages/components/src/stream-markdown/src/types.ts:42-50`:
```
export interface StreamMarkdownProps {
  content: string
  streaming?: boolean
  renderers?: Record<string, StreamMarkdownBlockRenderer>
}
```
Every real and demo call site above feeds `content` as the complete document string as of that render — none pass incremental chunks — consistent with the component's own internal full-re-lex-and-diff design already documented in `research/prior-decisions.md`.

---

## `TxCodeStream`

### Real consumer: none found

No file under `apps/core-app/src` references `TxCodeStream` (or the `code-stream` import path) anywhere. This component currently ships only as a documented, demoed component with **no in-product usage**.

### Nexus demo/gallery consumers

| File | Props used |
|---|---|
| `apps/nexus/app/components/docs/DocsComponentsGallery.vue:3872` | `:code="codeSample" lang="ts" filename="greet.ts" lang-label="TypeScript"` — full static code, no `revealed-lines` (whole listing shown) |
| `apps/nexus/app/components/content/demos/CodeStreamStaticDemo.vue:23` | Static variant |
| `apps/nexus/app/components/content/demos/CodeStreamStreamingDemo.vue:56` | The streaming-reveal variant |
| `apps/nexus/app/components/content/demos/CodeStreamDiffDemo.vue:32` | Diff variant, feeding `:diff` |
| `apps/nexus/app/components/content/demos/TemplateAgentChatDemo.vue:1658` | `:code`, `:diff`, `:revealed-lines`, `lang` inside the chat template, gated `v-else-if="item.kind === 'code'"` |
| `apps/nexus/app/components/content/demos/TemplateReleaseDemo.vue:1292` and `TemplateAutomationDemo.vue:1094,1312` | `:code="log" :revealed-lines="revealed" :min-height="0"` — a build/run-log surface; both files carry the identical comment "the log owns its scrolling: `TxCodeStream` never scrolls vertically itself" (`TemplateReleaseDemo.vue:1695`, `TemplateAutomationDemo.vue:1900`) |

### Prop contract and its "content is fed" model — materially different from `TxStreamMarkdown`

`packages/tuffex/packages/components/src/code-stream/src/types.ts:32-71`:
```
export interface CodeStreamProps {
  code: string
  lang?: string
  filename?: string
  langLabel?: string
  diff?: CodeDiffRow[]
  revealedLines?: number   // "the host owns the cadence, the component owns the transition" (types.ts:50-51)
  caret?: boolean           // default true
  lineNumbers?: boolean     // default true
  theme?: 'light' | 'dark' | 'auto'
  copyable?: boolean        // default true
  copyLabel?: string
  copiedLabel?: string
  minHeight?: number | string
}
```
`code` is always the **entire** text (final or in-progress), never a delta. Reveal progress is a **separate, host-driven cursor** (`revealedLines`) — the host decides how many lines are visible and re-renders that number upward over time (e.g., every demo drives it with its own interval/ref), and the component owns only the line-by-line transition, not the timing. This is the opposite division of labor from `TxStreamMarkdown`, where the component itself infers what is "new" by diffing the `content` string against its own previous render. Any `StreamCode` primitive built for the planned showcase needs to pick one of these two models (or a third) rather than assume they are interchangeable.

---

## `TxConversationStream`

### Real consumer: `apps/core-app/src/renderer/src/views/base/home/HomePage.vue`

```
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'   // HomePage.vue:3
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'                 // HomePage.vue:23
const streamRef = ref<TxConversationStreamInstance | null>(null)                               // HomePage.vue:112
```

Single call site, `HomePage.vue:1466-1695`:
```
<TxConversationStream
  v-if="!isEmpty"
  ref="streamRef"
  :key="conversationId ?? 'draft'"
  class="HomePage-Stream"
  role="log"
  :items="messages"
  item-key="id"
  :streaming="isStreaming"
>
  <template #item="{ item: message, index }"> ... </template>
</TxConversationStream>
```
Props actually supplied: `items`, `item-key` (string form, `"id"`), `streaming` (a single conversation-wide boolean), plus the `:key="conversationId ?? 'draft'"` on the host `<TxConversationStream>` element itself (not a component prop — it forces Vue to remount a fresh instance, and therefore a fresh height cache, per conversation). **Not** supplied: `loadOlder`, `hasMoreInitial`, `overscan`, `estimatedItemHeight` — i.e. HomePage does not wire pagination or tune virtualization defaults, consistent with `research/prior-decisions.md` §4's "no `loadOlder` this round" note (the transport is whole-conversation-grained).

### Nexus demo consumer with a richer prop set

`apps/nexus/app/components/content/demos/TemplateAgentChatDemo.vue:1541-1548`:
```
<TxConversationStream
  :key="generation"
  ref="streamRef"
  :items="state.items"
  item-key="id"
  :overscan="24"
  :estimated-item-height="88"
  :streaming="working && !reduced"
>
```
This demo exercises `overscan` and `estimated-item-height`, neither of which the real HomePage consumer sets — the only place in the repo these two tuning props are actually demonstrated. `streaming` is gated on `working && !reduced`, respecting the demo's own reduced-motion toggle. `TemplateAgentChatDemo.vue:19` imports the same `TxConversationStreamInstance` type as HomePage does, for the same `ref` pattern.

Other Nexus consumers: `apps/nexus/app/components/docs/DocsComponentsGallery.vue:3635-3641` (`:items="chatMessages" :item-key="(item: AiElementMessage) => item.id"` — function-form `item-key`, the only call site using the function form rather than a string field name); `apps/nexus/app/components/content/demos/ConversationStreamConversationStreamDemo.vue:81-99` (the component's own canonical demo).

### Type-only internal reference

`packages/tuffex/packages/components/src/instance-drift.contract.ts:43,100-116` imports `TxConversationStream`/`TxConversationStreamInstance` purely for the compile-time exposed-instance drift-guard contract described in `research/prior-decisions.md` §3 (the `vue-tsc` unwrapped-ref gotcha) — not a runtime consumer.

### Prop contract (for reference)

`packages/tuffex/packages/components/src/conversation-stream/src/types.ts:16-29`:
```
export interface ConversationStreamProps<T> {
  items: T[]
  itemKey: ConversationStreamItemKey<T>
  estimatedItemHeight?: number
  overscan?: number
  loadOlder?: () => Promise<ConversationStreamLoadResult>
  hasMoreInitial?: boolean
  streaming?: boolean   // "Drives the scroll-to-bottom pill's 'new content' state." (line 28)
}
```
and `ConversationStreamLoadResult` (`types.ts:12-14`, comment at lines 8-10): "The loader owns the data: it prepends older items into the `items` prop itself before resolving, and only reports whether more history exists. Returning items here would make the component a second source of truth." This is the shipped code that matches the design-doc rejection already recorded in `research/prior-decisions.md` §3 — confirming that decision actually landed as written. Note also that `streaming` here is documented as driving only the "jump to new content" pill, not per-item live styling — HomePage's per-message "is this segment live" state comes from `segment.streaming` (see `TxStreamMarkdown` section above), a completely separate signal.

---

## `TxTextMorph`

### Real consumer: `apps/core-app/src/renderer/src/views/base/VoiceInsights.vue`

```
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'   // VoiceInsights.vue:20
```
Two call sites, both dashboard metric values, not chat/streaming content:
- `VoiceInsights.vue:1091` — `<strong><TxTextMorph :text="heroMetric.value" /></strong>`
- `VoiceInsights.vue:1104` — `<strong><TxTextMorph :text="metric.value" /></strong>`

Both feed `text` as an already-fully-computed display string (a formatted metric value), re-bound reactively whenever the underlying metric changes — the textbook "value changes from A to B" case `TxTextMorph` is designed for, not a streaming-reveal case. `apps/core-app/src/renderer/src/views/base/VoiceInsights.test.ts:668` asserts on this usage via `wrapper.findAllComponents({ name: 'TxTextMorph' })`.

**`TxTextMorph` is not used anywhere in the streaming-chat pipeline** — `HomePage.vue` does not import it at all. The only chat-adjacent component that touches the morph engine is `TxChainOfThought`'s own independent markdown pass (see `TxStreamMarkdown` section above), which does not use `TxTextMorph` either.

### TuffEx-internal wrapper consumers

Direct (import `TxTextMorph` itself):
| File | Usage |
|---|---|
| `packages/tuffex/packages/components/src/badge/src/TxBadge.vue:4,68-73` | `import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'`; template: `<TxTextMorph v-if="numericValue !== null" :text="numericValue" :duration-ms="260" />`, falling back to plain `{{ value }}` text otherwise |
| `packages/tuffex/packages/components/src/text-transformer/src/TxTextTransformer.vue:5,153-158` | `import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'`; template: `<TxTextMorph v-if="usesMorph" :text="text" :duration-ms="durationMs" />`, with a non-morph fallback layer pair (`current`/`prev`) when `usesMorph` is false |

Indirect (import `TxTextTransformer`, which conditionally renders `TxTextMorph`):
| File | Usage |
|---|---|
| `packages/tuffex/packages/components/src/mode-chip/src/TxModeChip.vue:164` | `<TxTextTransformer ... />` for its label |
| `packages/tuffex/packages/components/src/status-hint/src/TxStatusHint.vue:89` | `<TxTextTransformer ... />` for its status text |
| `packages/tuffex/packages/components/src/switch/src/TxSwitch.vue:3,94,103` | `import { TxTextTransformer } from '../../text-transformer'`; two call sites, `<TxTextTransformer v-if="!slots.default" :text="label ?? ''" />` |

These three (`TxModeChip`, `TxStatusHint`, `TxSwitch`) never import `TxTextMorph` directly — they only reach it through `TxTextTransformer`'s own internal `v-if="usesMorph"` branch, so whether `TxTextMorph` actually mounts for them depends on `TxTextTransformer`'s `mode` resolution, not on anything these three components control directly.

### Nexus demo consumers

`apps/nexus/app/components/content/demos/StatCardInsightVariantDemo.vue:67`, `StatCardProgressVariantDemo.vue:46`, `TextMorphNumberPlaceValueDemo.vue:36`, `TextMorphTextMorphDemo.vue:43`, `TextMorphSpringDemo.vue:35`, `TemplateReleaseDemo.vue:1354`, `TemplateShellDemo.vue:810`, `TemplateShellConsoleDemo.vue:1358`, `TemplateDashboardDemo.vue:917`, `TemplateDashboardOpsDemo.vue:930`, `AutoSizerAutoSizerTextMorphDemo.vue:28` — all bind `:text` to a computed display value (currency totals, KPI numbers, online-count strings, progress percentages); none feed streaming/chunked content.

### Prop contract note

Every consumer above — real and demo — feeds `text` as a complete, already-known value on each change; none treat it as an appendable/growing stream. This reconfirms, from the consumer side, the boundary already identified in `research/prior-decisions.md`'s Motion section: `TxTextMorph`'s engine is scoped to "a mounted instance's value changes from one known string to another," which is a different shape of problem from "reveal a tail of content that has never been rendered before" (the shape a `StreamText` primitive would need to handle). No consumer in the repository currently asks `TxTextMorph` to do the latter.

---

## Caveats / Not found

- The whole-repo grep excluded any path segment matching `__tests__/` to keep results focused on real call sites rather than each component's own test suite; this could in principle hide a *different* component's test file that constructs one of the four components for a unit test, but the one instance that would matter here (`VoiceInsights.test.ts`) is a co-located `*.test.ts` file, not inside a `__tests__/` directory, and it did surface.
- `plugins/` (24 packages) and `packages/utils/` were included in the same repo-wide grep and returned zero hits for all four component names and their import paths — stated as a confirmed negative, not an assumption.
- This file does not re-derive the component-internal architecture (block-diffing, virtualization, morph engine) already covered in `research/existing-streaming-components.md` and `research/prior-decisions.md`; it only reports call sites, the exact props bound at each, and how content reaches those props.
- `TxCodeBlock` and `TxMermaidBlock` (the two internal fence-renderer sub-components living inside `stream-markdown/src/`) were not treated as one of the four named targets and were not searched for consumers beyond noting that `HomePage.vue:25` imports `TxCodeBlock` alongside `TxStreamMarkdown`.
