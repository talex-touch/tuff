# Intelligence Workflow

## Core Concepts
- **Workflow** = trigger → processors → actions.
- **Triggers**: CoreBox commands, clipboard events, schedulers, webhooks.
- **Processors**: scripts, plugin APIs, condition blocks.
- **Actions**: show results, write to storage, notify, or chain another workflow.

## Build Fast
1. Open Workflow Studio and choose a trigger (e.g., “clipboard contains image”).
2. Drop processors (OCR, translate, format) and link them visually.
3. Add actions (save to Clipbox, push to widget, send to third-party).
4. Use “Live Log” to inspect IO before saving.

## Templates
| Template | Flow |
| --- | --- |
| Smart Archive | Image → OCR → classify → sync folder |
| Code Review | Git hook → AI summary → team notification |
| Inspiration Line | Voice → text → tags → Drafts |

## Debugging
- Enable “Step Run” to inspect each node.
- Run `workflow:trace` for a postmortem report.
- Stream logs to Terminal Capsule via Channel API.

## Performance Tips
- Keep high-frequency workflows in the local daemon.
- Merge adjacent transforms; favor scripts over repeated nodes.
- Cache network calls to avoid flapping latency.
