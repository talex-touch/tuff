# Nexus Pending Components Worktable

> Date: 2026-06-21
> Scope: `apps/nexus/content/docs/dev/components/*.mdc`
> Purpose: formal worktable for AI review / aireview pending component docs performance follow-up.

## Summary

- Source files scanned: 216 localized `.mdc` files.
- Component entries: 108 slugs.
- Pending rule: `syncStatus != reviewed || verified != true`.
- Pending component entries: 76 slugs.
- Localized status counts: `migrated` 152 files, `reviewed` 64 files.
- Localized verified counts: `verified: true` 92 files, not verified 124 files.
- Demo count uses the real `:::TuffDemoWrapper` marker.
- Code block count only counts fenced Markdown code blocks. Demo embedded `code: |` blocks are represented by demo count instead.
- API table detection is conservative: explicit API/Props/Events/Slots headings with a nearby Markdown table, or explicit `DocApiTable` / `TuffPropsTable` / `PropsTable`.

## Evidence Inputs

- `output/playwright/nexus-docs-pending-b21-after-3213-2026-06-21.json`
- `output/playwright/nexus-docs-pending-b22-after-3200-2026-06-21.json`
- `output/playwright/nexus-docs-metadata-fastpath-b28-after-3214-2026-06-21.json`
- `output/playwright/nexus-docs-assistant-context-b30-after-3200-2026-06-21.json`

`Requests` is shown as `requests/scripts/styles/failed`. Rows without current Playwright data are marked `not sampled`; they must get a baseline before code changes.

## Top 30 Pending Worktable

| Rank | Slug | syncStatus | verified | Body total | Demos | Code blocks | API table | Requests | Next action |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 1 | `fusion` | migrated | false | 101 KB (51/50) | 20 | 0 | yes | 427/268/36/0 (b30 after) | P0 section split plus API table visible-only; keep Assistant/context on intent. |
| 2 | `card` | migrated | false | 94 KB (47/47) | 24 | 0 | yes | 432/428/37/0 (b28 after) | P0 split API table and demo sections; verify code block renderer stays lazy. |
| 3 | `avatar-variants` | migrated | false | 70 KB (35/35) | 2 | 0 | no | 425/403/18/0 (b21 after) | P0 static summary shell plus defer long examples/body sections. |
| 4 | `glass-surface` | migrated | true | 32 KB (17/15) | 4 | 0 | yes | 465/430/16/0 (b36 after2) | P1 strict pending defer now covers `migrated + verified`; API/props table visible-only remains a later production/chunk check. |
| 5 | `index` | migrated | true | 32 KB (16/16) | 0 | 0 | no | not sampled | P1 static shell plus section split. |
| 6 | `gradual-blur` | migrated | false | 30 KB (15/14) | 14 | 0 | yes | 450/415/16/0 (b36 after2) | P1 current fallback split already defers API and later demos; demo visible-only remains a later production/chunk check. |
| 7 | `auto-sizer` | migrated | false | 27 KB (14/13) | 14 | 0 | yes | 419/418/33/0 (b22 after) | P1 demo visible-only plus API table visible-only. |
| 8 | `text-transformer` | migrated | false | 27 KB (13/13) | 10 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 9 | `scroll` | migrated | false | 22 KB (11/10) | 12 | 0 | yes | 419/418/33/0 (b22 after) | P1 demo visible-only plus API table visible-only. |
| 10 | `base-surface` | migrated | false | 21 KB (11/10) | 10 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 11 | `base-anchor` | migrated | true | 20 KB (10/10) | 12 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 12 | `foundations` | migrated | false | 19 KB (10/10) | 0 | 0 | no | not sampled | P2 keep in pending queue; sample before code change. |
| 13 | `group-block` | migrated | false | 18 KB (10/9) | 14 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 14 | `select` | migrated | true | 18 KB (9/9) | 12 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 15 | `container` | migrated | false | 18 KB (9/9) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 16 | `radio` | migrated | true | 17 KB (9/8) | 12 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 17 | `icon` | migrated | false | 15 KB (8/8) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 18 | `button` | migrated | true | 15 KB (7/8) | 0 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 19 | `flat-radio` | migrated | false | 14 KB (7/7) | 14 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 20 | `transition` | migrated | false | 13 KB (7/7) | 4 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 21 | `dialog` | migrated | true | 13 KB (6/6) | 8 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 22 | `picker` | migrated | true | 12 KB (6/6) | 2 | 2 | yes | not sampled | P1 API/props table visible-only boundary. |
| 23 | `flip-overlay` | migrated | false | 12 KB (6/6) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 24 | `switch` | migrated | true | 11 KB (6/6) | 12 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 25 | `grid` | migrated | false | 11 KB (6/6) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 26 | `date-picker` | migrated | true | 10 KB (5/5) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 27 | `glow-text` | migrated | false | 10 KB (5/5) | 6 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 28 | `typing-indicator` | migrated | false | 10 KB (5/5) | 4 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |
| 29 | `input` | migrated | true | 10 KB (5/5) | 12 | 0 | yes | not sampled | P1 demo visible-only plus API table visible-only. |
| 30 | `code-editor` | migrated | false | 10 KB (5/5) | 2 | 0 | yes | not sampled | P1 API/props table visible-only boundary. |

## Next Batch Candidates

1. `fusion`: first P0 code batch. Split long body sections and API table behind visible-only boundaries, while keeping current Assistant context behavior on intent.
2. `card`: second P0 code batch. Split demo/API sections and guard the real code block path so the renderer remains lazy.
3. `avatar-variants`: P0 template/static-shell batch. It has less demo pressure but a large body, so it is useful for proving section-level body deferral.
4. `text-transformer` or `base-surface`: first unsampled P1 baseline batch. Run Playwright screenshot/HAR before any code change.

## Notes

- `glass-surface`, `index`, `base-anchor`, `select`, `radio`, `button`, `dialog`, `picker`, `switch`, `date-picker`, and `input` are still pending by the strict rule because `syncStatus` remains `migrated`, even when `verified: true`.
- Existing evidence proves `fusion`, `card`, `avatar-variants`, `glass-surface`, `gradual-blur`, `auto-sizer`, and `scroll` have clean failed request counts in the sampled runs. It does not prove unsampled pages are fast.
- This file is a planning/report artifact only. It does not add a reusable audit script or broaden the test harness.
