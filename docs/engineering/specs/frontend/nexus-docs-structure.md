# Nexus Docs Page Structure

> The page shape every doc under `apps/nexus/content/docs/` follows, and the sidebar information architecture above it. Adopted 2026-09-25 on the user's instruction to migrate the docs to the reference site's structure (component page = hero → preview/code → short labelled sections; sidebar = Getting Started / Integrations / Components / Blocks / …). Read before writing or restructuring any docs page.

---

## 1. Page shape

| Layer | What renders it | Rule |
| --- | --- | --- |
| Hero | `DocHero.vue` from frontmatter | `title` = the component/feature name; `description` = **one sentence**, no trailing period in Chinese, no marketing adjectives |
| Preview / Code | `:::TuffDemoWrapper{demo="…" code-lang="vue"}` | The `code:` block is an idealised, truthful snippet — not the demo source |
| Body | hand-written `.mdc` | Only the canonical sections below, in this order |
| On this Page | `app/layouts/docs.vue` outline | Built from the rendered H2/H3; nothing to declare per page |

## 2. Canonical H2 sections — fixed order, empty ones omitted

English / 中文, in this exact order:

1. `## Installation` / `## 安装`
2. `## Usage` / `## 用法`
3. `## API Reference` / `## API 参考`
4. `## Overview` / `## 概述`
5. `## Technologies` / `## 技术实现`
6. `## Use cases` / `## 使用场景`
7. `## Features` / `## 功能特性`
8. `## Accessibility` / `## 无障碍`
9. `## Customization` / `## 自定义`
10. `## Related components` / `## 相关组件`
11. `## FAQ` / `## 常见问题`

A page renders only the sections it has content for, but never reorders them. **Page-specific H2 sections are allowed** and belong between `## API Reference` and `## Overview` (the reference site puts its page-named section and its page-named FAQ there); they must not be invented to dodge the taxonomy. Long-form pages (architecture, guide, reference) keep their own H2 outline and add canonical sections only where they carry real content — those pages are prose manuals, not component pages.

### Canonical H3 sub-headings

`### Best Practices` / `### 最佳实践` (inside `## Usage`), `### Props` / `### 属性`, `### Events` / `### 事件`, `### Slots` / `### 插槽`, `### Exposed Methods` / `### 暴露方法`, `### CSS Variables` / `### CSS 变量`, `### Types` / `### 类型` (inside `## API Reference`).

## 3. What goes in each section

- **Installation** — two short blocks: the install command, then the component's own import plus the stylesheets it needs (`@talex-touch/tuffex/<dir>` + `/style.css`, `base.css` once per app). No prose beyond one line. Skip on pages that are not installable (templates, architecture, guide).
- **Usage** — one line of what it does, then one `### <variant>` per demo. Best Practices lives at the end of this section as terse bullets, not a separate H2.
- **API Reference** — the `DocApiTable` blocks and signature tables, unchanged. Facts here are contracts: never reword a prop name, default or type.
- **Overview** — how it behaves: interaction contract, precedence rules, focus/keyboard/DOM/ARIA behaviour, degradation. This is what used to be `## Interaction Contract` (component docs) / `## 交互要点` (templates) / `## Positioning` (suite pages).
- **Technologies** — how it is built and where it comes from: drivers (rAF loops, CSS masks, container queries), upstream ports and licences, the source/tests paths that used to sit in `## Review Notes` / `## Source`, and the verified-coverage line. Bullets, no retrospective prose.
- **Use cases** — 2–4 bullets: the situations the component/template/feature is for. Lifted from the old scenario paragraphs, not invented.
- **Accessibility / Customization / Related components / FAQ** — only where the page already had that material (`## Accessibility`, `## Style Customization`, `## 改造建议`, cross-links, FAQ).

## 4. Copy rules

- Descriptions are one line. Section bodies are bullets, tables or code — no paragraph longer than three lines.
- Do not delete facts: prop/event/slot rows, defaults, code samples, contract bullets, source paths and coverage claims all survive the migration. What goes is repetition, authoring chatter ("reviewed against…", "this section was added because…") and restated headings.
- zh and en stay section-for-section identical (`check-doc-translation-parity`); zh keeps the Chinese heading names above.
- Frontmatter keys are unchanged (`title`, `description`, `category`, `status`, `since`, `tags`, `syncStatus`, `verified`). Quote any `description` containing `: `.

## 5. Sidebar information architecture

Reference site → ours, top to bottom (`DocsSidebar.vue`, `docsSidebar.*` i18n):

| Group | 中文 | Contents |
| --- | --- | --- |
| Getting Started | 开始使用 | `guide/index`, `guide/start`, `dev/getting-started/*` |
| Guide | 使用指南 | `guide/features/**`, `guide/scenes/**`, `guide/tips/**` |
| Integrations | 集成 | `dev/api/**`, `dev/extensions/**`, `dev/intelligence/**` |
| Components | 组件 | the tuffex suites (concepts / base / pro / ai / data / flow) |
| Blocks | 模块 | the templates suite |
| Design | 设计基础 | `foundations`, `theming`, `icons`, `accessibility`, `utils`, `sound` |
| Developer | 开发者 | `dev/architecture/**`, `dev/tools/**`, `dev/reference/**`, `dev/release/**` |

Order inside a group is fixed by `SECTION_ORDER` in `DocsSidebar.vue`; a page that is not listed there falls back to title order.

## 6. Gates

```bash
cd apps/nexus
node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs
pnpm exec vitest run test/docs/tuffex-component-docs-coverage.test.ts   # per-component section contract
```

`tuffex-component-docs-coverage.test.ts` is the machine contract for §2 on component pages: live demo, `## Usage`, `### Best Practices`, `## API Reference`, `### Props`, `## Overview`, `## Technologies`. Component pages are expected to fail the build without them.

## 7. Wrong vs Correct

```markdown
<!-- Wrong: taxonomy sections renamed per page, prose invented to fill them -->
## Getting started with Button
## How to use it
## API

<!-- Correct: canonical names, canonical order, empty sections absent -->
## Installation
## Usage
### Best Practices
## API Reference
## Overview
## Technologies
## Use cases
```
