# Implement — Templates page: AI answer (multi-turn in TxConversationStream)

Follow Parent `implement.md` §1.5, §2. Tick the parent checklist items for this child as they land, and record verification evidence (commands, screenshots, measurements) below.

## Verification evidence (2026-10-01)

### Registration chain (`nexus-docs-templates.md` §2)

1. `content/docs/dev/components/template-ai-answer.{zh,en}.mdc`, with `category: TemplateAi`.
2. `TAXONOMY`: `TemplateAi` is now agent-chat, ai-answer, research.
3. `SECTION_ORDER`: the same order.
4. `TemplateAiAnswerDemo.vue`, whose root is `<TemplateFrame>`.
5. The `demo-registry.ts` line, added after the demo file existed.

### Gates (§8)

- `check-demo-registry-orphans`, `check-mdc-fences`, `check-doc-translation-parity` and `check-icon-collections`: all 0.
- `recategorize-component-docs.py`: "would update 0 file(s)".
- The sidebar API (after evicting its nitro cache) lists 16 templates and none without a category; the new page is `TemplateAi`.
- `/zh` and `/en` pages return 200.
- Nexus vue-tsc with a probe: only the probe and the known `nuxt.config.ts` `pwa` error, and no TS1128.
- Docs vitest: 53 passed. ESLint: 0 errors, 0 warnings.

### Browser (ego, TaskSpace 170)

**Autoplay, dark, no input.**

| Time | What happens |
|---|---|
| 7 ms | The question is shown and the answer streams; Stop is visible. |
| 4914 ms | The answer is done: its footer appears, the status reads 「可以提问」, Stop hides. |
| 6508 ms | The scripted follow-up is asked, about 1.6 s later. |
| — | Its table grows 0 → 1 → 2 → 3 → 4 rows. |
| 8744 ms | The source ends. |
| 8845 ms | The answer is done. |

- At most one caret was visible at any time, and no frame had two.
- At the end the conversation sits at the bottom (scrollTop 652.5 of 653), with the follow-ups in view.

**Interactions.**
- **A citation chip** shows 「宿主会打开：…/architecture/search-engine」, and that turn's sources open (`aria-expanded="true"`). The URL is unchanged.
- **A follow-up** adds a third turn, which streams.
- **Stop generating** marks the answer 「已停止生成」 and shows its footer.
- **Regenerate** streams the answer again, to done.
- **A typed question** (focus plus real keys and Enter) gets the canned answer.

**Sizes.** Horizontal overflow inside `.template-frame__body` is 0 at every size:
- the docs column: 782 × 560;
- expanded: 1225 × 953, centred;
- narrow: a 560 px window, giving a 470 px stage.

**Reduced motion** (emulated), then reset:
- 2 turns, 2 footers, the table present;
- no Stop, 0 running reveal animations, no busy answer;
- still 2 turns after 2.5 s, so no scripted follow-up.

**Fixed after looking.**
- The question bubble spanned the whole row; it is now compact and on the right.
- At narrow widths the hidden status had stopped pushing the reset button to the end; the title now takes that margin.

**Screenshots:** `/tmp/se-verify/shots/tpl-{dark-end,light-mid,expanded,narrow,column2}*.png`.

### Independent check (trellis-check, 2026-10-01)

Report only. All five areas came back clean:
- the template rules of §6;
- virtual-list keys and the permanent tail;
- the turn model and its races (reset, regenerate while another turn streams, a locale change, stop after the source has ended, a double `done`);
- docs against the demo, in both languages, with valid links;
- content accuracy against the PowerSDK page.

One info-level note: the 「宿主会打开」 feedback is an inline `role="status"` line on a tracked timer, not `TxToastPanel`. It is kept that way because the shipped `TemplateResearchDemo` uses the same inline line for the same citation feedback, so the two TemplateAi pages stay consistent. Nothing was changed.
