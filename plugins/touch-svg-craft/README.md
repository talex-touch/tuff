# Touch SVG Craft (`touch-svg-craft`)

Crisp Vector Icon Browser, SVG Optimizer & Framework Converter for Tuff CoreBox — running 100% locally in the isolated Prelude runtime with zero external dependencies.

## Features / 核心功能

- **Curated 86 Built-in Crisp Vector Icons / 内置 86 枚清晰矢量图标**
  - Clean 24×24 stroke-based geometric icons organized across 5 categories:
    - **UI (20)**: `search`, `plus`, `minus`, `x`, `check`, `edit`, `trash`, `copy`, `clipboard`, `download`, `upload`, `share`, `filter`, `sliders`, `settings`, `eye`, `eye-off`, `lock`, `unlock`, `heart`
    - **Dev (18)**: `code`, `terminal`, `git-branch`, `git-commit`, `git-merge`, `git-pull-request`, `bug`, `database`, `server`, `cpu`, `braces`, `package`, `file-code`, `folder`, `folder-open`, `key`, `webhook`, `box`
    - **Media (16)**: `play`, `pause`, `stop`, `skip-back`, `skip-forward`, `volume-2`, `volume-x`, `mic`, `camera`, `video`, `image`, `music`, `film`, `maximize`, `minimize`, `crop`
    - **Nav (16)**: `home`, `menu`, `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`, `chevron-up`, `chevron-down`, `chevron-left`, `chevron-right`, `external-link`, `compass`, `map-pin`, `globe`, `sidebar`, `layers`
    - **Status (16)**: `info`, `alert-triangle`, `alert-circle`, `check-circle`, `x-circle`, `help-circle`, `bell`, `shield`, `shield-check`, `zap`, `flame`, `sparkles`, `clock`, `loader`, `wifi`, `battery`
  - Search by name, category (`ui`, `dev`, `media`, `nav`, `status`), English tags, or Chinese keywords (`搜索`, `终端`, `锁`, `警告`).
  - Optional inline size & color customization: e.g. `svg search 32 #3b82f6` or `icon git-branch 20`.
- **SVG Optimizer & Normalizer / SVG 压缩去冗余与规范化**
  - Paste any raw `<svg ...>...</svg>` or `<?xml ...?><svg ...>` markup directly.
  - Strips XML prologs, `<!DOCTYPE>`, comments, `<metadata>`, Inkscape/Sodipodi/Sketch/Illustrator editor attributes and empty `<g>`/`<defs>` containers, trims redundant decimal zeros (`12.000` -> `12`), collapses inter-tag whitespace, ensures `xmlns="http://www.w3.org/2000/svg"`, and derives missing `viewBox` from numeric `width`/`height`.
  - Shows exact UTF-8 byte savings (`before -> after`, `-XX.X%`).
- **One-Click Multi-Format Converter / 一键多格式转换**
  - **Raw SVG**: Optimized standalone vector markup
  - **Vue 3 SFC**: Typed `<script setup lang="ts">` + `<template>` component
  - **React JSX**: Functional component with camelCase SVG attributes (`strokeWidth`, `fillRule`, `clipPath`, `className`) and JSX `style={{ ... }}` objects
  - **CSS Data URI**: `url("data:image/svg+xml,...")`
  - **Base64 Data URL**: `data:image/svg+xml;base64,...` (pure-JS UTF-8 encoder)

## Usage Examples / 使用示例

| Input | Result |
| --- | --- |
| `svg search` | Finds `search` icon with actions to copy Raw SVG, Vue 3 SFC, React JSX, CSS Data URI, or Base64 |
| `icon dev` / `svg cat:status` | Browses all icons in the Dev or Status category |
| `svg heart 32 #f43f5e` | Renders `heart` icon at `32x32` with `#F43F5E` stroke |
| `svg <?xml version="1.0"?><!-- comment --><svg width="24" height="24">...</svg>` | Optimizes SVG, reports byte savings, and outputs Raw SVG / Vue 3 SFC / React JSX / CSS Data URI / Base64 |

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies icons, optimized SVG, Vue 3 SFC, React JSX, CSS Data URI, or Base64 output to the clipboard. Fails closed if permission is denied or unavailable.

## Verification

```bash
node -c index.js
node --test index.test.cjs
```
