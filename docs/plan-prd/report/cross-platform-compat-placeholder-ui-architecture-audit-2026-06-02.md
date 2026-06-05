# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-02）

> 范围：`apps/core-app`、`apps/nexus`、`packages/tuffex`、`packages/intelligence-uikit`、`packages/tuff-business`、`docs/plan-prd` 当前 live tree 与未提交工作区。
> 口径：承接 2026-06-01 增量审计，重点复核 TuffEx 按需入口、消费侧 UI 迁移、文档同步、占位/伪实现、安全边界与下一步执行顺序。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock payment URL、伪成功空 payload 或可消费占位响应。测试 mock、playground mock、输入框 placeholder 与 demo 文案不计为生产占位风险。
- **UI 判断**：整体仍符合专业桌面指令中心方向，适合高密度、可扫描、低装饰的信息架构。当前观感瓶颈不是配色重画，而是 TuffEx 统一组件消费、语义控件、真实视觉 evidence 与状态表达的一致性。
- **兼容性判断**：当前最大新增风险是 TuffEx 子路径入口、局部 `style.css`、`base.css` 与消费侧 alias 在 dev / production 两套构建下需要同时验证；其次是自动化 shell 环境无法运行仓库要求的 `pnpm` 与 Volta Node。
- **占位与不优雅代码判断**：未看到新的 production fake-success，但仍保留 2026-06-01 的高信号治理项：`SharedPluginDetailReadme` 默认 sanitize、preload loading overlay `innerHTML`、Nexus device identity / privacy settings 的 `localStorage` 口径、CoreApp UI preference facade、语义点击控件与 cloud preset unavailable contract。
- **下一步判断**：先收 TuffEx 按需入口与 audit 证据，再收 Nexus/CoreApp/`intelligence-uikit` 消费侧迁移，最后回 File write/store boundary。不要把 UI/SDK 迁移和 FileProvider 写入边界混在同一批。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.5 / 10 | 大量 renderer 消费侧已转向 TuffEx 子路径与 i18n helper，方向正确；但主产品仍有旧 base 组件、语义点击债务、preload HTML 构造和 UI preference 分散问题。 |
| Nexus 文档与生态站 | 8.2 / 10 | Dashboard、auth、docs、store 页面大量迁到 TuffEx 子路径，且此前已有 30/30 visual smoke evidence；当前需确认 async component name、SSR/hydration 与局部样式在生产构建中一致。 |
| TuffEx 组件体系 | 8.2 / 10 | 子路径 exports、`base.css`、局部 `style.css`、on-demand style plugin、audit 脚本与重组件拆分明显改善 package 边界；风险在于 dev/prod 样式注入差异和未运行完整 audit。 |
| `intelligence-uikit` | 7.3 / 10 | 已从根入口转到 chat/markdown/auto-sizer 等子路径，AI UI 复用度提升；playground mock 属于开发展示，不是生产占位。需要消费侧 typecheck 与样式完整性证据。 |
| 架构健壮性 | 7.9 / 10 | Search/Indexing Runtime 当前无新增脏改动，文档执行顺序已回到先收 UI/SDK 再回 File boundary；短板仍是 Windows evidence、release gate 与当前自动化工具链不一致。 |

## 本轮代码证据

### 1. 当前工作区仍是 UI/SDK 大切片，不适合继续叠 Search/File 改动

证据：

- `git rev-list --count --left-right origin/master...HEAD` 显示当前 `master` 领先远端 `56` 个提交。
- `git diff --stat` 在审计开始时显示 `291 files changed`，主要集中在 `packages/tuffex`、CoreApp renderer、Nexus app、`intelligence-uikit` 与 plan-prd 文档。
- Search/Indexing Runtime 相关代码已按 2026-06-01 口径收口，当前 dirty 重点不在 FileProvider。

判断：

- 文档里“先收 TuffEx/Nexus/renderer，再回 File write/store boundary”的顺序是合理的。
- 继续在当前 worktree 上叠 FileProvider 写入迁移，会显著增加 review 与回归不可控性。

### 2. TuffEx 按需入口方向正确，但 dev/prod 样式一致性必须复验

证据：

- `packages/tuffex/package.json` 新增 `./base.css`、`./*/style.css` 与组件子路径 export。
- `packages/tuffex/packages/components/vite.config.js` 新增每个组件的多入口构建。
- `packages/tuffex/packages/script/build/component-styles.ts` 为组件生成 `dist/es/<component>/style.css` 与 `dist/lib/<component>/style.css`。
- `packages/tuffex/packages/script/build/on-demand-style-plugin.ts` 会在 production 消费侧给 `@talex-touch/tuffex/<component>` 自动补局部样式导入。
- 当前 dist 文件存在：`packages/tuffex/dist/es/base.css` 为 9554 bytes，`packages/tuffex/dist/es/components.css` 为 313566 bytes，低于 audit 脚本里的 16 KiB / 330 KiB 预算。

判断：

- 这是从“全量根入口 + 全量样式”走向“base token + 子路径组件 + 局部样式”的正确架构。
- 需要注意：TuffEx 源码子路径不是全部在 `index.ts` 里直接导入 standalone SCSS。当前只有少数组件如 `button`、`switch` 入口显式导入 style；大量组件依赖 SFC `<style>` 或构建后的局部 `style.css`。
- 因此必须同时验证：
  - development source alias 下组件样式不会缺失；
  - production package subpath 下 on-demand style plugin 能补齐局部样式；
  - 外部消费者手动导入 `@talex-touch/tuffex/<component>/style.css` 能解析到 dist 文件。

### 3. CoreApp 与 Nexus 消费侧迁移方向正确，但要用最近路径证据兜住

证据：

- CoreApp renderer 已把入口样式从 `@talex-touch/tuffex/style.css` 切到 `@talex-touch/tuffex/base.css`。
- CoreApp `modules/tuffex/index.ts` 已从根包动态加载改为受控组件子路径 import。
- Nexus `nuxt.config.ts` 已把全局 CSS 切为 `base.css`，并接入 TuffEx 子路径 alias 与 on-demand style plugin。
- Nexus `app/plugins/tuffex.ts` 给 async TuffEx component 设置 `name`，用于稳定 SSR/hydration 与 visual smoke 定位。
- `packages/intelligence-uikit` 已去掉根样式 import，改用 `base.css` 加 chat/markdown/icon 等局部样式。

判断：

- 这些改动能降低 bundle 回涨和根入口耦合，是 KISS/DRY 方向的收敛。
- 但当前涉及页面和组件很多，必须用 focused build/typecheck/visual smoke 分批证明，不能只凭 diff 形状判断已完成。

### 4. 旧全量 `style.css` 文档示例仍会误导新消费者

证据：

- `packages/tuffex/README.md`、`packages/tuffex/README_ZHCN.md` 仍保留 `@talex-touch/tuffex/style.css` 的 legacy full-style 示例。
- Nexus content docs 里也仍有旧的根入口和全量 style 示例，例如 `apps/nexus/content/docs/dev/tools/tuffex.*.mdc` 与 foundations docs。

判断：

- 这不是运行时 fake-success，也不需要删除 legacy compatibility。
- 但 public docs 应把推荐路径改成 `base.css` + 组件子路径 + 局部 `style.css`，把 `style.css` 明确降为 legacy full-style import，避免新用户继续引入全量样式。

### 5. 占位扫描未发现新的生产可消费假实现

判断：

- `packages/intelligence-uikit/src/playground` 的 `mock` / `mockup` 是 playground 展示，不是生产路径。
- 测试里的 `vi.mock`、stub、dummy query 用例不属于产品占位。
- 表单 `placeholder` 文案属于正常输入提示，不属于假实现。
- `window.$t` / `window.$i18n` 在本轮扫描范围内未发现新增直接访问。

仍需保留的 P1：

- `apps/core-app/src/preload/index.ts` loading overlay 仍有 `oStyle.innerHTML` 与 `container.innerHTML`，当前内容来自本地常量，风险低于用户日志渲染，但 preload 边界建议改为 `textContent` + `createElement`。
- Markdown/HTML 渲染边界、UI preference storage、Nexus device marker 仍按 2026-06-01 报告推进。

### 6. 当前自动化环境不满足仓库验证要求

证据：

- 当前 shell 的 `node` 来自 `/Applications/Codex.app/Contents/Resources/node`，版本为 `v24.14.0`。
- 仓库 `package.json` / Volta 约束 Node 为 `22.16.0`，`packageManager` 为 `pnpm@10.32.1`。
- 当前 shell `PATH` 里没有 `pnpm` / `corepack` / Volta bin，导致 `pnpm -C "packages/tuffex" run audit:exports` 与 `audit:size` 无法运行。
- `git diff --check` 通过。

判断：

- 这不是代码本身的兼容性问题，但会影响自动化审计可信度。
- 下一轮应先在正常开发环境里恢复 `pnpm` / Volta Node，再跑 TuffEx build/audit/typecheck；否则不能把 audit 结果写成已通过。

## 兼容性与架构判断

### 已改善

- TuffEx root import 正在被消费侧子路径 import 替代，包体和样式回涨风险下降。
- 重组件内部逻辑被拆到 helper 文件，例如 motion、runtime、model、wheel/pull plugin 等，单文件 SRP 明显改善。
- Nexus async component name 与 visual smoke 证据方向正确。
- CoreApp i18n 扫描未发现新增 `window.$t` / `window.$i18n` 直接访问。
- `git diff --check` 通过，文档和代码当前没有 whitespace 级失败。

### 未闭环

- `pnpm` / `corepack` 不可用，无法在本轮跑 TuffEx `build`、`audit:exports`、`audit:size`、`audit:types`、CoreApp/Nexus typecheck。
- TuffEx dev/prod 样式注入一致性仍需实际 dev server + production build / visual smoke 证明。
- README 与 Nexus docs 旧 `style.css` 示例仍需要切成推荐用法。
- Windows App indexing、Everything registry PATH、CoreBox function key hardening、手动索引完成通知仍缺 Windows 真机 evidence。
- `quality:release` 仍需单独按全仓 lint/build 口径收口，本轮不改变门禁。

## 下一步建议

1. **先恢复验证环境**：在 Node `22.16.0` + `pnpm@10.32.1` 下跑 `pnpm -C "packages/tuffex" run build`、`audit:exports`、`audit:size`、`audit:types`。
2. **先收 TuffEx 包内切片**：子路径 exports、局部 style、on-demand plugin、组件 helper、audit 脚本一起提交，附 build/audit 证据。
3. **再收 Nexus 页面/visual smoke 切片**：保留 async component name、Nuxt alias、页面适配和 visual smoke 证据，不混 CoreApp FileProvider。
4. **再收 CoreApp renderer/i18n/UI 切片**：重点验证 `typecheck:web`、受控 TuffEx 动态注册和无 `window.$t` 回潮。
5. **再收 `intelligence-uikit` 消费侧切片**：跑 package typecheck，证明 chat/markdown 等子路径类型和样式完整。
6. **最后回 File write/store boundary**：在 UI/SDK worktree 干净后继续 FileProvider 写入、progress、integrity reset runtime boundary。
7. **补文档推荐用法**：README / Nexus docs 把默认示例改为 `base.css` + 子路径 import，`style.css` 只作为 legacy full-style 入口说明。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮未修改运行时代码，也未改变 `quality:pr` / `quality:release` 门禁，因此不更新 Roadmap 与 Quality Baseline。
