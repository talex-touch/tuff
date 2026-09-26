# Implement — TabBar / FlatRadio / SidebarNav 接入果冻指示器

## 前置

- `09-25-jelly-indicator-engine` 已完成且通过其 review gate。
- 读 research/indicator-family.md §2–§4、§7、§9–§10；`component-guidelines.md`（One writer per CSS custom property、State motion）。

## 步骤

1. [x] TxTabBar：接引擎（design.md「TxTabBar」）；删 transform / width 过渡；验证 `tab-bar.test.ts`，补一条"切换后经引擎停在目标、`none` 无节点"的用例。
2. [x] TxFlatRadio：接引擎；删过渡；改写 `flat-radio.test.ts:171–187`；确认 `:148–167`、`:203–208`、`:218–221` 仍成立。
3. [x] TxFineTuneCard：删掉对 FlatRadio 指示器 `transition` 的覆盖（`TxFineTuneCard.vue:341–357` 中过渡部分），`fine-tune-card.test.ts` / `fine-tune-card-motion.test.ts` 通过。
4. [x] TxSidebarNav：接引擎（`axis: 'y'`、`deform.across` 小、`maxGrowth` 小、`jellySpring(indicatorDuration)`）；CSS `top: 0`；改写 `sidebar-nav.test.ts:234–270`；`context-cards-motion.test.ts`、`unscoped-deep-selectors.test.ts` 通过。
5. [x] 验证（`packages/tuffex` 内）：`node node_modules/vitest/vitest.mjs run packages/components/src/{tab-bar,flat-radio,sidebar-nav,fine-tune-card,context-cards} packages/components/src/__tests__/shadow-light-source.test.ts packages/components/src/__tests__/unscoped-deep-selectors.test.ts`；eslint 改动文件；`git diff --check`。
6. [x] 重建 dist（锁 + 关 verify-deps），`pnpm audit:size`；核对 :3200 上三组件的 `data-v-*` 与 dist 一致（`useJellyIndicator` 是新模块，TabBar / FlatRadio / SidebarNav 依赖变化，按规范需要重启 :3200 时先在并行会话里公告）。
7. [x] 调参（ego）：画廊 TabBar / FlatRadio / SidebarNav 格子与 Radio 并排，CDP `Animation.setPlaybackRate` 放慢录帧；定 `maxGrowth` / `deform` / SidebarNav 追随手感，回写 design.md。
8. [x] 文档（zh + en）：`tab-bar`、`flat-radio`、`sidebar-nav`、`fine-tune-card` 页按 research §8 清单改写（指示器移动、减弱动效、测量、测试覆盖）；demo：`TabBarIndicatorDemo` 说明果冻，SidebarNav demo 描述更新；门禁三件套。
9. [ ] 回归（ego + core-app）：Nexus 模板（`TemplateShellDemo`、`TemplateSettingsDemo`、`TemplateInboxDemo`）、core-app 设置页语言 / 语音识别与商店头部；`prefers-reduced-motion: reduce` 模拟；控制台无新增报错。

## 回滚点

三个组件各自独立（每个组件一个 SFC + 测试 + 文档）；`TxFineTuneCard` 的覆盖删除与 FlatRadio 绑定回滚。

## 实现与验证记录（2026-09-26）

- 实现 agent：三个组件接引擎（测量不变、`onFrame` 命令式绘制、模板不再绑定这些属性、晚挂载节点由同步 watcher 补写最近一帧；只有选中值 / 悬停目标变化走弹簧）；FineTuneCard 删掉对滑块 transition 的覆盖；测试 234 例（变异：去掉移动 / 去掉鼓起上限 / 去掉 SidebarNav 移动 / 加回 transform 过渡均被抓到）；8 个 mdc + TabBarIndicatorDemo。
- 实现 agent 实测发现：`maxGrowth` 管不住弹簧的**位置**过冲——TabBar pill 冲出 bar 13.9px、line 落地铺开 30.6px、FlatRadio 11px、SidebarNav 12.3px（卡片内边距 8px），`overflow: hidden` 外框会切出硬边。
- 主会话处理：引擎加可选 `bounds`（沿行进轴的墙，越墙即停并按越过落点记挤压；目标在墙外时墙让到目标）；TabBar 墙 = bar 宽内收半个鼓起上限（pill/block `insetY`，line 上限 8px → 4px），FlatRadio 内收 5px，SidebarNav 用 `nav.scrollHeight` 内收 2px。引擎新增 2 个墙测试。
- 最终：tuffex 相关 20 个测试文件 290 例全绿；vue-tsc 0 错误；eslint 通过；dist 重建后 `audit:size` 在限额内（全量 610.4/612 KiB、按需 619.2/620 KiB）。
- ego（TaskSpace 31）：静止态三格截图正常；冻结 rAF 抓到 TabBar pill `scale(0.814, 1.273)`（鼓到 bar 全高 56px 不越出）、line `scale(0.814, 1.401)`、FlatRadio 滑块 `scale(0.814, 1.294)`；往返（首 → 末 → 首）实测画出范围：TabBar line 0.01–315.99/318、pill 0–318/318、FlatRadio xl 0.11–218.69/219、SidebarNav 0–96.97/97；reduced-motion 下三者都只写端点、`scale(1, 1)`；画廊页控制台 0 错误。
- 未做：core-app（设置页语言 / 语音识别的 TuffBlockFlatRadio、商店头部）在运行中的 Electron 里抽查——core-app dev 属于另一会话，没有去驱动它。
