# 设置页接入骨架加载态

> 父任务：`08-05-skeleton-loading-default`（子任务 C）。复杂任务，需 `design.md` + `implement.md`。

## Goal

把 `apps/core-app/src/renderer/src/views/base/settings` 下有异步加载态的设置页，全部改为骨架屏呈现，做到加载前后无可见布局跳变。

## 现状

`views/base/settings` 下共 **33 个页面，其中 13 个有 loading / pending 状态，0 个有骨架屏**。

> **规划期前提已被实测推翻（2026-08-06）**：本节原先写「页面统一由 `SettingSection` + `SettingRow` 组合，版式高度规整，骨架可高度复用，不需要每页定制」。实测**只有 `SettingSkillsMcp` 一个页面**使用 `SettingSection`/`SettingRow`；10 个页面用 `TuffGroupBlock`，2 个是纯自有版式。
>
> 因此「不需要每页定制」不成立：可复用件是两个骨架容器（`SettingSkeleton` / `TuffGroupBlockSkeleton`），但**每页仍需判定骨架该替换整页还是某个区域、以及行的真实形状**。详见 `design.md` 与 `implement.md` 的结构族分类。

## 依赖与顺序

**依赖子任务 B（`08-05-skeleton-primitives`）完成**——本子任务消费 B 产出的分组/行骨架原语与防闪烁能力。B 未完成前不要开工，否则会重新长出 B 要消灭的手搓 div。

## 改造清单（13 页 + 2 对话框）

| # | 页面 |
|---|------|
| 1 | `SettingDownload.vue` |
| 2 | `SettingFileIndex.vue` |
| 3 | `SettingFileIndexAppIndexManager.vue` |
| 4 | `SettingFileIndexAppDiagnostic.vue` |
| 5 | `SettingMessages.vue` |
| 6 | `SettingTools.vue` |
| 7 | `SettingPlatformCapabilities.vue` |
| 8 | `SettingNetwork.vue` |
| 9 | `SettingUser.vue` |
| 10 | `SettingSentry.vue` |
| 11 | `SettingPermission.vue` |
| 12 | `SettingUpdate.vue` |
| 13 | `SettingSkillsMcp.vue` |
| 14 | `components/ShortcutDialog.vue`（对话框，按 R5 判定是否纳入） |
| 15 | `components/FailedFilesListDialog.vue`（对话框，按 R5 判定是否纳入） |

清单以规划时实测为准；实施首步须重新扫描核对，若有新增/改名页面一并纳入并在 `implement.md` 记录差异。

## Requirements

- **R1 逐页贴合版式**：每页骨架的分组数、每组行数、是否含描述行、是否含尾部控件占位，须与该页加载完成后的真实结构一致。**不允许所有页共用同一个「3 组 × 4 行」的通用骨架糊弄过去**——那样加载完仍会跳变，等于没做。
- **R2 复用 B 的原语**：一律通过 B 产出的原语组合，页面内不得新增手搓骨架 div 或 `@keyframes`。
- **R3 只替换加载态呈现**：不得改动页面的数据加载逻辑、SDK 调用与状态管理；只把「加载期间渲染什么」换掉。
- **R4 不破坏刷新语义**：已有内容的后台刷新不得把已渲染内容替换成骨架（只有首次加载才显示骨架）。
- **R5 对话框判定**：两个对话框须显式判定是否适用骨架——对话框打开即加载且版式已知的适用；若加载范围过小或版式随数据变化，记录为不适用并写明理由，不得默认跳过。
- **R6 防闪烁**：统一使用 B 提供的延迟出现 / 最短展示时长能力。
- **R7 无障碍不回退**：骨架期间不得让焦点落入不可见的占位元素。

## Non-goals

- 不改 `SettingSection` / `SettingRow` 的视觉与交互。
- 不改数据层。
- 20 个无加载态的设置页不在本轮范围（同步渲染，无骨架需求）。

## Acceptance Criteria

- [ ] **AC1**：清单内每个适用页面在首次加载期间呈现骨架。
- [ ] **AC2**：逐页核对加载前后无可见布局跳变，并留下核对记录（逐页勾选，不是整体一句「已核对」）。
- [ ] **AC3**：13 个页面无一新增手搓骨架 div 或自定义 `@keyframes`。
- [ ] **AC4**：后台刷新场景不显示骨架（至少在有刷新能力的页面上验证）。
- [ ] **AC5**：两个对话框有明确的适用/不适用判定与书面理由。
- [ ] **AC6**：`pnpm lint`、`npm run typecheck`、设置页相关既有单测全绿（该目录下已有大量 `*.test.ts`，须确认未被破坏）。

## Notes

- 该目录下已有较多同名 `*.test.ts` 显示逻辑测试（如 `setting-skills-mcp-display.test.ts`），改动渲染分支时须同步确认这些测试的断言是否覆盖加载态。
- 版式语言参考：分组标签外置 + 单层卡片 + C2/Row，不用折叠头/逐行图标；单页 2 组 8~9 行封顶。骨架照抄同一版式即可。
