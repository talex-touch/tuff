# Skeleton 骨架屏成为默认加载态

> 父任务。持有需求集、子任务地图与跨子任务验收标准，本身不作为实现目标。

## Goal

把「**骨架屏是默认加载态**」从一次性口头约定，变成仓库里成文、有原语支撑、且存量已对齐的项目原则：

1. 规则写进 `.trellis/spec/frontend/`，让所有 agent / 会话都读得到；
2. 骨架原语能真正贴合本项目版式，而不是只提供一个对不上的通用卡片；
3. 设置页与其他异步页面的存量加载态完成改造。

用户原话（2026-08-05）：「所有的设置页面 等其他的 以后都要加入一个原则 都可以做成 skeleton 骨骼屏」。

## 现状基线（2026-08-05 实测）

以下均为读源码核实，非推测：

| # | 事实 | 证据 |
|---|------|------|
| B1 | tuffex 有 4 个骨架组件，但**只有 `TxSkeleton` 可配置**（`loading`/`variant`/`width`/`height`/`radius`/`lines`/`gap`，且 `loading=false` 时渲染 `<slot/>`，是正确的包裹式 API） | `packages/tuffex/packages/components/src/skeleton/src/TxSkeleton.vue`、`types.ts` |
| B2 | `TxCardSkeleton` / `TxListItemSkeleton` / `TxLayoutSkeleton` **零 props、版式全硬编码**（如卡片骨架写死 40% 标题宽、80% 描述宽，并自带 padding/border/background 卡片外壳） | `skeleton/src/TxCardSkeleton.vue`、`layout-skeleton/src/TxLayoutSkeleton.vue` |
| B3 | `TxLayoutSkeleton` 是 **app-shell 骨架**（header + 200px sidebar + content），与设置页无关，不可复用 | `layout-skeleton/src/TxLayoutSkeleton.vue:9-31` |
| B4 | 设置页的组合原语是 CoreApp 自有的 `SettingSection` / `SettingRow` / `SettingChip` / `SettingDivider` / `SettingButton`，**不是** tuffex 卡片 | `views/base/settings/SettingSkillsMcp.vue:21-25` |
| B5 | `views/base/settings` 下 **33 个页面，13 个有 loading/pending 状态，0 个有骨架屏** | 见下方清单 |
| B6 | CoreApp 现有 3 个骨架（`StoreDetailSkeleton` / `CapabilitySkeleton` / `ProviderSkeleton`）**全部手搓 div，零复用 tuffex，各自复制一份 shimmer keyframes** | `components/store/StoreDetailSkeleton.vue`、`components/intelligence/skeleton/*.vue` |
| B7 | skeleton 与 layout-skeleton **均无 `prefers-reduced-motion` 守卫**，无限 shimmer / pulse 动画无条件运行 | 全目录 grep 无命中 |
| B8 | `.trellis/spec/frontend/component-guidelines.md` **完全没有加载态章节**，原则在仓库规范中尚未成文 | 全文 grep `loading\|skeleton\|骨架` 无命中 |

**B2 + B4 是本任务的技术核心矛盾**：现成的 `TxCardSkeleton` 自带卡片外壳且宽度写死，套到 `SettingRow` 版式上加载完成后仍会跳变——那样的骨架屏只是换了个样子的 loading 占位，没有兑现「稳定版式、消除跳变」的价值。因此**不能直接套用现成组件了事**。

### 13 个有加载态的设置页

`SettingDownload` / `SettingFileIndex` / `SettingFileIndexAppIndexManager` / `SettingFileIndexAppDiagnostic` / `SettingMessages` / `SettingTools` / `SettingPlatformCapabilities` / `SettingNetwork` / `SettingUser` / `SettingSentry` / `SettingPermission` / `SettingUpdate` / `SettingSkillsMcp`
（另有 `components/ShortcutDialog.vue`、`components/FailedFilesListDialog.vue` 两个对话框）

## Requirements

- **R1 规则成文**：骨架屏作为默认加载态的规则写入 `.trellis/spec/frontend/`，并在 `index.md` 的 Hard Frontend Rules / Pre-Development Checklist 中可被检索到。规则须明确「默认要求，非可选优化」。
- **R2 骨架必须贴合真实版式**：骨架的分组数、行数、行高、间距须与加载完成后的真实版式一致，加载前后不得产生可见的布局跳变。这是验收的核心，而非「页面上有骨架」。
- **R3 原语先行**：设置页版式（`SettingSection` + `SettingRow`）须有对应的可配置骨架原语，禁止各页面手搓 div。新原语的归属层遵循既有硬性规则——新的原语行为属于 TuffEx。
- **R4 收敛存量手搓实现**：B6 的 3 个手搓骨架统一收敛到共享原语，消除重复的 shimmer keyframes。
- **R5 无障碍**：骨架动画须遵守 `prefers-reduced-motion`，并对辅助技术隐藏（`aria-hidden`，现有 `TxSkeleton` 已有，需保持）。
- **R6 存量改造**：13 个有加载态的设置页 + store / intelligence / download 等其他异步页面接入骨架。
- **R7 不引入闪烁**：极快返回的数据不应让骨架一闪而过；须有统一的最短展示时长或延迟出现策略，避免「骨架比 spinner 更抖」。

## Non-goals

- 不改动数据加载逻辑本身（SDK 调用、缓存、并发策略）——只改加载期间的呈现。
- 不重写 `SettingSection` / `SettingRow` 的现有视觉与交互。
- 不处理 Nexus（`apps/nexus`）与插件 surface 的加载态；本轮范围限定 CoreApp renderer + TuffEx。
- 不改 `TxLayoutSkeleton` 的 app-shell 用途。

## 子任务地图

| 子任务 | 交付物 | 依赖 |
|--------|--------|------|
| A. spec 成文 | `.trellis/spec/frontend/` 加载态规则 + index 挂载 | 无（可与 B 并行） |
| B. 骨架原语基座 | TuffEx 可配置设置页骨架原语 + reduced-motion 守卫 + 存量手搓实现收敛 | 无 |
| C. 设置页存量改造 | 13 个设置页接入骨架 | B |
| D. 其他异步页面改造 | store / intelligence / download 等接入骨架 | B |

父/子结构不是依赖系统：C、D 对 B 的顺序依赖写在各自的 `prd.md` / `implement.md` 里。

## 跨子任务验收标准

- [x] **AC1**：`component-guidelines.md` 新增 `## Loading States` 章节；`index.md` Hard Frontend Rules 增加骨架屏条目；Pre-Development Checklist 插入第 4 项，编号 1–13 连续。（A ✅ 完成）
- [x] **AC2**：`TxRowSkeleton`（行形状，7 个 props）+ CoreApp `SettingSkeleton`（`groups` 表达分组）；测试守住「不自带卡片外壳」。（B ✅ 完成）
- [x] **AC3**：`skeleton-motion.test.ts` 16 用例，基于编译后 CSS 断言 5 个组件的守卫数 === 动画数，且守卫不得隐藏占位。（B ✅ 完成）
- [x] **AC4**：`@keyframes` 收敛到 `style/mixins.scss` 单一定义并由测试守护；三个 CoreApp 手搓骨架改为薄封装，`@keyframes` 计数为 0。（B ✅ 完成）
- [ ] **AC5**：13 个设置页在加载期间呈现骨架；逐页人工核对加载前后无可见布局跳变（R2）。（C 未开始）
- [ ] **AC6**：store / intelligence / download 等异步页面同样接入。（D 未开始）
- [x] **AC7**（A+B 范围内）：tuffex 测试 146 文件 / 1086 用例全过且与 HEAD 基线一致；tuffex typecheck 0 错误；CoreApp `npm run typecheck` exit 0；涉及文件 lint 清零。C / D 完成后需重跑。

## 进度

**A + B 已完成并验证**（2026-08-06）。C、D 仍为 `planning`，其 `design.md` / `implement.md` 待补——现在可以补了，因为 B 的 props 契约已确定：

- `TxRowSkeleton`：`rows` / `leading` / `description` / `trailing` / `separated` / `titleWidth` / `descWidth`
- `SettingSkeleton`：`groups: Array<{ label?, rows, description?, trailing?, leading? }>` + `dividers`
- `useDeferredLoading(source, { delay = 150, minDuration = 400 })`

C / D 开工前应先读 B 的 `prd.md` 末尾「遗留缺口」一节。

## Notes

- 本原则同时记录在 AI 侧记忆 `skeleton-loading-state-principle.md`，但**仓库 spec 才是权威来源**——AI 记忆只对单个用户的会话生效，其他协作者与 agent 读不到。
- 版式参考：设置页遵循「分组标签外置 + 单层卡片 + C2/Row」，骨架直接照抄同一版式即可。
