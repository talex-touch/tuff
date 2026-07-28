# 分组实现与验证结果

## 1. 执行结论

- 已按 `research/commit-inventory.md` 审查 G01-G19，并仅在对应组内补充最小修复或回归测试。
- 暂存区始终为空；未执行 `git add`、`git commit`、`git push`、amend、rebase 或 reset。
- 基线的 40 个 tracked / 2 个 untracked 业务文件，现为 44 个 tracked / 8 个 untracked 业务文件。新增差异均属于下述组内闭环：G04 manager 测试、G06 cache/flush 协作、G07 共享事件、以及 6 个 focused test 文件。
- G01-G11、G13-G19 的组内行为验证通过。G12 自动激活策略本身可运行，但仍需明确接受其对既有手动激活决策的反转后再提交。
- 全局 typecheck 尚有两处未修改源码阻塞；Nexus 官方 visual smoke 还被未修改的缺失脚本阻塞。具体见第 4 节。

## 2. G01-G19 结果

| 组 | 结果 | 实现 / 补强 | 验证证据 | 提交判断 |
|---|---|---|---|---|
| G01 | 通过 | 冷启动耗时只解析一次；时钟回拨时 clamp 到 0；缩窄 `StorageList` import，并隔离单测网络副作用 | `startup-analytics.test.ts` 6/6 | 可提交 |
| G02 | 通过 | 增加 50/50/1 分块与第二批失败后保留首批提交的回归测试 | AppProvider 59/59 | 可提交；保留非全批原子语义说明 |
| G03 | 通过 | 复核 warmup / backfill / abort 时序，未发现需追加生产修复 | AppProvider 59/59 | 可提交 |
| G04 | 通过 | 增加 live window 与 destroyed window 的 admission failure 分支覆盖 | IPC 8/8，manager 6/6 | 可提交 |
| G05 | 通过 | schema promise 复用与失败重试契约通过 | indexing task state 15/15 | 可提交 |
| G06 | 通过（全局 typecheck 外部阻塞） | 引入单调 access version 与不触碰 LRU 的 `peekRaw()`；flush 后复核版本、dirty、访问；manual / force 均保护 hot config | Storage LRU 5/5；node typecheck 仅失败于未修改 `plugin.ts` | 可提交 |
| G07 | 通过 | 复用 permission event；`open-settings=false` 显式提示失败；增加 composable 与交互流测试 | platform permission 22/22，refresh 3/3，composable 2/2，flow 3/3 | 可提交 |
| G08 | 通过 | 仅在 storage response 成功后关闭引导；失败时恢复 `beginner.init`、保留页面并提示本地化错误 | Done 2/2，flow 3/3，CoreApp web typecheck 通过 | 可提交 |
| G09 | 通过 | 验证模块级 singleton 可见性与 false / nextTick / true 强制 remount | beginner guide 2/2，CoreApp web typecheck 通过 | 可提交 |
| G10 | 通过 | compact email 仅作用于设置列表行 | identity presentation 3/3 | 可提交 |
| G11 | 通过 | 删除的是同一 namespace 内较早的重复 key；保留后的 canonical key 仍存在，静态调用继续解析 | JSON / 静态引用复核，CoreApp web typecheck 通过 | 可提交 |
| G12 | 行为通过，策略待确认 | 未改变自动激活产品策略；补强后的 source contract 通过 | 定向 Nexus 7/7 中包含 demo 4 条；长文档初始 2/9 active，滚动后 9/9，JS heap 约增加 7.5 MB | 暂缓；需明确接受反转手动激活策略和累积挂载成本 |
| G13 | 通过（Nexus 外部阻塞） | 模块级 full-body LRU 与 route-owned state 契约通过 | cache/remount 定向断言通过；浏览器 Input -> Button -> Input 往返正文、标题、URL 一致 | 可提交 |
| G14 | 通过（Nexus 外部阻塞） | aside 文案迁入 i18n；新增样式的负 letter-spacing 改为 0 | hero / chrome 定向断言通过；桌面/移动、明/暗主题均无横向溢出或标题越界 | 可提交 |
| G15 | 通过 | 离屏取消 RAF；运行时 reduced-motion 变更可停止 / 恢复；补 observer 生命周期测试 | Floating 12/12；TuffEx typecheck 通过 | 可提交，且应位于 G16 前 |
| G16 | 通过（官方 smoke 外部阻塞） | `border-image` 改为 rounded mask border；reduced-motion 停动画；发现并修复 961px 桌面布局重叠，将 compact 布局断点调到 1140px | contract 3/3；959/961/1139/1141px 均 6 卡片、0 overlap、0 overflow；手工截图通过 | 可提交；记录官方 smoke 缺失脚本 |
| G17 | 通过 | 生命周期、stream fallback、bridge、port policy 一并复核 | Utils 13/13 | 可提交 |
| G18 | 通过 | core-app 显式 Vue catalog 与 lock importer 一致 | frozen install 通过；CoreApp web typecheck 通过 | 可提交 |
| G19 | 通过 | touch-intelligence 使用 frontend Vue catalog，锁定版本仍为 3.5.39 | frozen install 通过；24/24 plugins validate 通过 | 可提交 |

## 3. 自动化验证汇总

通过：

- `pnpm lint:changed`
- `git diff --check`
- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm plugins:validate`：24/24（保留既有 touch-dictation / UI-only plugin warning）
- AppProvider：59/59
- CoreBox IPC + manager：8/8 + 6/6
- Indexing task state：15/15
- Storage LRU：5/5
- Onboarding / permission / settings focused suites：合计 37/37
- Utils transport focused + bridge / policy：13/13
- TuffEx Floating：12/12
- Nexus 本次目标定向断言：7/7；Instant Preview：3/3
- TuffEx typecheck
- CoreApp renderer typecheck（直接调用 lockfile 中 `vue-tsc@3.3.7`）

未全绿但已归因：

- Nexus 聚合 focused suite：55/60。5 个失败是未修改 `SearchPalette.vue` / `DocsSidebar.vue` 的历史脆弱源码字符串断言，与本次 G12-G14 增量无关；失败名称为 global search intent、component metadata、docs navigation、sidebar warmup、shared request dedupe。
- CoreApp node typecheck：仅 `src/main/modules/plugin/plugin.ts:167,169,171` 的既有 TS2556 tuple spread 错误。
- Nexus typecheck：仅 `packages/utils/transport/port-handoff.ts:114,119,153` 的既有 `MessagePort | undefined` 错误。
- `visual:smoke:tuffex`：未修改的 `packages/tuffex/scripts/audit-cdp-client.mjs` 缺失，命令在启动阶段报 `ERR_MODULE_NOT_FOUND`。

## 4. 浏览器与视觉证据

- Nexus 服务：`http://localhost:3200`（复用已运行服务）。
- Instant Preview：1440x900、900x800、1139x800、1141x800；六张卡片无重叠、无横向溢出，25px rounded mask border 生效。
- reduced-motion：自定义属性边框动画为 `none`，布局保持稳定。
- Docs：1440x900 与 390x844，明暗主题均检查；正文、hero、outline / resources 区无横向溢出，标题未越界。
- Docs 导航：A -> B -> A 使用可见 sidebar link 复测，URL、document title、H1 与正文一致，无 loading / not-found 残留。
- 截图：`/tmp/nexus-instant-*.png`、`/tmp/nexus-docs-*.png`。文件尺寸与 viewport 尺寸已校验，均为非空 PNG。

## 5. 最终提交计划

保持清单原有 19 组和 hunk ownership，不合并共享文件。建议顺序：

```text
G18 -> G19
G01 -> G02 -> G03 -> G05 -> G06 -> G04
G07 -> G08 -> G09 -> G10 -> G11
G17
G15 -> G16
G13 -> G14
G12（仅在明确接受自动激活策略后）
```

本轮按用户明确边界未执行任何暂存或提交。最终状态为 `master...origin/master [ahead 3]`，staging 为空。
