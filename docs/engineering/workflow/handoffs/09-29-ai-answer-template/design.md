# Design — Templates page: AI answer (multi-turn in TxConversationStream)

The design lives in the parent: Parent `design.md` §7 (template row) and `nexus-docs-templates.md`. Record child-specific decisions or deviations below as they arise.

## Decisions and deviations

### Page structure

`template-ai-answer.{zh,en}.mdc` follows the structure every template page has now: `## 用法` → `### 多轮问答` (the demo) → `## 概述` → `## 自定义` → `## 相关组件` (a region | components | role table).

This is not the page contract in `nexus-docs-templates.md` §3 (场景 / 模板 / 组成 / 交互要点 / 改造建议):
- `da4d09250` (2026-09-25) moved every component and template page to the Usage / API Reference structure;
- the docs coverage test requires `## 用法` / `## Usage`.

§3 is stale and is listed for the family's spec update.

### Turns and rows

- **State.** `state.turns` holds the conversation. Each turn is a question row and an answer row in `state.items`, inserted in front of a **permanent tail row**.
- **Why the tail.** TxConversationStream keeps its last item outside the virtual list and remounts it when another arrives. With the tail there, an answer being written mounts once and keeps its pacer.
- **Unique ids.** Row ids carry a session prefix that changes on every reset; the prefix also keys the stream (`component-guidelines.md` → Virtual List Keys). The demo mounts on the client only, so `Math.random` causes no hydration mismatch.

### Playback

- **Start.** `@enter` starts it, never `onMounted`. The first answer streams in bursts and pauses once (900 ms) after its opening paragraph.
- **The scripted follow-up.** 1.6 s after the first answer is done, the template asks one follow-up ("How much memory does warming up take?"), whose answer delegates a table.
  - A `pointerdown` or `keydown` inside the template cancels it, so the reader takes over.
  - Scrolling past does not cancel it.
- **Stop generating** is a `TxButton` above the prompt bar, because TxPromptBar has no stop control.
  - It ends that turn's source; the element still reveals what had arrived.
  - The footer then says 「已停止生成」, and Regenerate stays available.
- **Regenerate** is offered on the latest turn only. It bumps the turn's `gen`, which keys its TxStreamElement, so a fresh element plays the answer again.
- **Reduced motion:** both turns render complete, and no timer starts. `resetDemo` is exposed, and `watch(locale, resetDemo)` resets on a language change.

### Citations and sources

- **The numbering is global.** `[n]` numbers resolve against the full source list given to TxStreamElement. Each answer's TxSources lists only the sources that answer cites.
- **Opening a chip.**
  - It opens that turn's source stack (a key bump with `default-open`).
  - It shows 「宿主会打开：…」 above the composer for 3.2 s.
  - Neither the chips nor TxSources ever navigate.

### Layout

- **The docs column:** the full width.
- **≥ 960:** the conversation and the composer are centred at 760 px.
- **< 640:**
  - the header's status and the answers' avatar are hidden;
  - the title takes the auto margin, so the reset button stays at the end;
  - questions are compact bubbles on the right (`max-width: min(460px, 86%)`).

### Content

- **Topic.** CoreBox's first-search cold start, in zh and en.
- **Sources** are real Nexus pages: `dev/architecture/search-engine`, `dev/architecture/corebox-system` and `dev/api/power`, on `tuff.tagzxia.com`.
- **The PowerSDK code** uses the documented API (`usePowerSDK`, `isLowPower`, `getLowPowerStatus`). `prewarmIndex` is marked as a sketch.
- **The table** is labelled as sample data, for a qualitative comparison only.
