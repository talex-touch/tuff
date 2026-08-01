# Git stash 只读审计报告

> 审计时间：2026-07-31
> 比较目标：当前 `master`（`6ff864fcd`，与 `origin/master` 同步）
> 约束：全程仅使用 `git stash list/show`、`git show`、`git diff`、`git ls-tree`、`git rev-list`、`git log`、`git grep`、`git merge-base` 等对象读取命令；未执行 `apply` / `pop` / `drop`，未切换分支，未改动索引或源码工作区，未提交。
> 注意：`stash@{n}` 会随 stash 栈变化而漂移，后续操作应以本报告记录的完整对象 ID 为准。

## 1. 结论摘要

| 当前引用 | 固定对象 ID | 创建时间 | 原始基线 | 变更规模（含 untracked） | 结论 | 建议 |
|---|---|---|---|---:|---|---|
| `stash@{0}` | `5291ff49e375cc618984e9cb247d7320b2f0c319` | 2026-07-28 22:45:04 -07:00 | `fd5ec291c` | 546 文件记录，+30,815/-22,078 | **已吸收** | 不恢复；确认不再需要历史快照后，可在用户批准后删除 |
| `stash@{1}` | `d2b03eaf5438bbb1f7a7caddca8f77edffcee4c7` | 2026-07-14 01:32:43 -07:00 | `9c53ba742` | 854 diff 记录，+116,759/-23,439，含 5 个二进制文件 | **仅保留备份**（成果基本已吸收/演进） | 禁止整体恢复；当前未发现值得选择性恢复的源码候选 |
| `stash@{2}` | `907c8510bb4203731398dd105d3872262c13cac7` | 2026-07-13 19:05:20 -07:00 | `b95604d86` | 819 diff 记录，+112,779/-23,152，含 5 个二进制文件 | **仅保留备份**（旧一代超大快照） | 禁止整体恢复；优先视为 `stash@{1}` 之前的历史保险副本 |
| `stash@{3}` | `bc4a2f4ef824556a563b0481aa9a372cbcf948e5` | 2026-06-21 22:06:48 +08:00 | `a6ee6f983` | 24 文件，+3,230/-3,003 | **已吸收** | 不恢复；可在用户批准后删除 |

**总判断：没有发现可直接或值得立即“候选选择性恢复”的独立源码成果。** 两个小/较新的 stash（0、3）已有明确吸收证据；两个 7 月中旬的大 stash（1、2）是跨模块工作区快照，虽保留历史保险价值，但其关键成果已进入 `master`、被迁移或被后续架构主动替代。任何整体恢复都会把数百个旧文件覆盖到已演进 132～593 个提交后的代码上，冲突及功能倒退风险很高。

## 2. 审计口径

### 2.1 文件级比较

对每个 stash 将其第一父提交作为原始基线，并将 stash 的 tracked tree 与第三父提交（若存在）的 untracked tree 合并为审计快照，再与当前 `master` 比较：

- **当前完全相同**：stash blob 与当前 `master` blob 相同；可直接认定已吸收。
- **历史完全相同，当前已演进/删除**：stash blob 可在 `master` 历史中找到，但当前版本又有后续修改或主动移除；认定已吸收后演进。
- **历史中从未出现相同 blob**：继续按路径、符号、后续提交和替代架构做语义审计，不能仅凭 blob 不同认定为“缺失成果”。
- **master 相对原始基线未变**：重点检查 stash 独有内容是否属于候选成果、历史任务记录、锁文件、证据附件或已废弃实现。

### 2.2 风险口径

- 基线是否为当前 `master` 祖先以及相距提交数。
- 变更跨越模块数量、删除/重命名、二进制证据、lockfile、Trellis 任务快照。
- 后续提交是否明确完成、迁移、重构或删除相同能力。
- 只认可路径和语义边界清晰、当前架构仍需要、且可独立验证的恢复候选。

## 3. `stash@{0}`：lint-staged 自动备份

### 3.1 元数据与范围

- 对象：`5291ff49e375cc618984e9cb247d7320b2f0c319`
- 创建：2026-07-28 22:45:04 -07:00
- stash 标题：`lint-staged automatic backup`（对象提交主题为 `WIP on master: fd5ec291c ...`）
- 基线：`fd5ec291c66dd049c32a048f3d7c5b7d5327e46e`，2026-07-28 22:08:55 -07:00，`chore(trellis): preserve concurrent task records`
- 基线已包含于 `master`；基线至当前 `master` 共 132 个提交。
- 546 个文件记录，+30,815/-22,078；无 untracked 第三父提交、无二进制文件。
- 主要模块：
  - `packages/tuffex`：282
  - `apps/nexus`：207
  - `apps/core-app`：30
  - `packages/test`：7
  - 官方插件与 Trellis 记录：20

### 3.2 吸收证据

文件树比较结果：

- **512/546** 个文件与当前 `master` 完全相同。
- **19/546** 个文件的 stash blob 在 `master` 历史中曾完全出现，之后继续演进或被移除。
- 余下 **15/546** 个文件虽没有完全相同 blob，但均能对应到后续同能力提交或文档重写，没有发现当前缺口。

主要证据：

1. **插件隔离与 Prelude 能力已完整进入并继续演进**
   - 代表路径：
     - `apps/core-app/src/main/modules/plugin/host/plugin-browser-open-capabilities.ts`
     - `apps/core-app/src/main/modules/plugin/host/plugin-host-child-runtime.ts`
     - `apps/core-app/src/main/modules/plugin/plugin-module.ts`
     - `.trellis/spec/frontend/plugin-runtime-security.md`
   - 相关提交：
     - `911fe1c6f` `feat(plugin): isolate fixed-action official preludes [task 297]`
     - `006fa3984` `feat(plugin): project intelligence through isolated host [task 297]`
     - `997b246f5` `feat(plugin): hard cut Prelude utility isolation [task 297]`
   - stash 中两份当前路径已不在 master 的任务文件：
     - `.trellis/tasks/07-27-isolate-plugin-prelude-297/implement.jsonl`
     - `.trellis/tasks/07-27-isolate-plugin-prelude-297/implement.md`
     其 blob 已在 `master` 历史出现，属于任务记录生命周期变化，不是缺失源码。

2. **TuffEx 组件实现绝大多数逐 blob 相同**
   - 282 个 `packages/tuffex` 文件构成最大模块；总体 512 个当前完全相同文件已覆盖该批组件实现、测试与导出。
   - 后续修复提交包括 `b73d540f8` `fix(tuffex): remediate component audit findings` 与 `2a586c405` `test(tuffex): guard component export and instance contracts`，说明该批成果并非遗失快照。

3. **Nexus 组件文档与落地页已重写而非缺失**
   - 代表路径：
     - `apps/nexus/content/docs/dev/components/base-anchor.en.mdc`
     - `apps/nexus/content/docs/dev/components/card.en.mdc`
     - `apps/nexus/content/docs/dev/components/index.en.mdc`
     - `apps/nexus/app/components/tuff/landing/TuffLandingEcosystem.vue`
   - 相关提交：`e5b621a63` `docs(nexus): streamline TuffEx component reference`、`62ecb1976` `feat(nexus): refine ecosystem section interactions`。
   - 这些路径当前与 stash 不同是后续精简和交互演进，不应回滚到 stash 版本。

### 3.3 风险与分类

- **风险**：整体恢复会覆盖插件隔离、隐私生命周期、TuffEx 审计修复和文档精简后的版本；即使大部分文件相同，余下 34 个演进文件也集中在安全敏感的插件宿主与文档契约层。
- **独立价值**：仅有历史快照价值，没有当前待恢复成果。
- **分类**：**已吸收**。
- **处置**：不要恢复；在用户明确批准、且无需保留 lint-staged 保险快照后，属于可删除对象。

## 4. `stash@{1}`：优化集成前超大 WIP 快照

### 4.1 元数据与范围

- 对象：`d2b03eaf5438bbb1f7a7caddca8f77edffcee4c7`
- 创建：2026-07-14 01:32:43 -07:00
- 标题：`On master: WIP before optimization-integration merge (756 changes, 2026-07-14)`
- 基线：`9c53ba742e22b3b772b0bbb13596982e83a5503d`，2026-07-13 19:01:55 -07:00，`merge: integrate repository optimization`
- 基线已包含于 `master`；基线至当前 `master` 共 484 个提交。
- `git stash show --include-untracked`：854 个 diff 记录，+116,759/-23,439，5 个二进制文件；底层由 620 个 tracked 变更路径和 235 个 untracked tree 路径组成（其中 rename/路径重叠使 diff 记录数与 tree 路径数存在 1 的差异）。
- 主要模块：
  - `apps/nexus`：426
  - `apps/core-app`：153
  - `.trellis/tasks`：116
  - `packages/utils`：54
  - `packages/tuffex`：26
  - `docs/plan-prd`：21
  - `docs/engineering`：14
  - AI、插件、测试、CLI 等其余模块约 44

### 4.2 文件级吸收情况

合并 tracked/untracked tree 后共审计 855 个路径：

- **297** 个与当前 `master` 完全相同。
- **544** 个 stash blob 曾在 `master` 历史中完全出现，随后演进、移动或移除。
- **14** 个 blob 从未以完全相同内容进入 `master`；语义审计见下。

即 **841/855（98.4%）** 可由“当前完全相同”或“历史完全出现后演进”直接证明已吸收。剩余 14 个不是自动恢复候选，因为其所在能力均有明确后续替代。

### 4.3 看似缺失但实际已迁移/淘汰的关键路径

1. **旧 Intelligence DeepAgent 编排实现**
   - 路径：
     - `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.ts`
     - `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.test.ts`
   - stash 版本分别约 1,351 行和 666 行，当前路径不存在。
   - 历史证据：`5427d65fa` `feat(intelligence): cut over orchestration to Pi runtime` 明确完成运行时切换；此前 `7faea27bf`、`440dd4217` 已持续演进治理与上下文能力。
   - 结论：这是旧运行时快照，恢复会重新引入已切除的 DeepAgent 路径，**高风险且不应恢复**。

2. **旧 PermissionChecker**
   - 路径：
     - `apps/core-app/src/main/modules/system/permission-checker.ts`
     - `apps/core-app/src/main/modules/system/permission-checker.test.ts`
   - 当前能力位于 `apps/core-app/src/main/modules/system/platform-permission-service.ts` 及其测试；stash 中的 `PermissionType`、`PermissionStatus`、系统事件和文件访问根能力均能在新服务找到。
   - 相关提交：`2cf1c7cd2` `fix(core-app): harden macOS permission + file-access monitoring`。
   - 结论：已迁移并加固；旧文件恢复会制造双实现和事件所有权冲突。

3. **旧 unplugin exporter**
   - 路径：
     - `packages/unplugin-export-plugin/src/core/exporter.ts`
     - `packages/unplugin-export-plugin/src/__tests__/index-bundling.test.ts`
   - 当前相同职责和符号已进入 `packages/tuff-cli-core/src/exporter.ts` 与 `packages/tuff-cli-core/src/__tests__/exporter-prelude.test.ts`。
   - 相关提交：`44544d09a` `feat(plugin): retire legacy CLI shims`。
   - 结论：旧包实现已退休，不应恢复。

4. **旧规划文档路径**
   - 路径：
     - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
     - `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
   - 相关提交：`065868219` `docs: consolidate roadmap and clean docs structure`；当前文档结构已完成合并清理。
   - 结论：是旧信息架构副本，不是待恢复文档。

5. **旧截图框选 UI**
   - untracked 路径：
     - `apps/core-app/src/renderer/src/views/assistant/ScreenshotRegionSelector.vue`（264 行）
     - `apps/core-app/src/renderer/src/views/assistant/ScreenshotRegionSelector.test.ts`（122 行）
   - 两个 stash blob 与提交 `7faea27bf` 中新增版本完全相同；随后由 `f184d0966` `feat(screenshot): add versioned native capture workflow` 明确删除。
   - 当前截图架构位于：
     - `apps/core-app/src/main/modules/screenshot-session/`
     - `apps/core-app/src/renderer/src/views/screenshot/ScreenshotOverlay.vue`
     - `apps/core-app/src/renderer/src/views/screenshot/ScreenshotEditorShell.vue`
   - 结论：已被版本化 native capture workflow 替代，恢复旧组件会倒退协议和窗口架构。

### 4.4 任务记录、生成物与证据附件

- untracked tree 含 **116 个 `.trellis/tasks` 文件**，覆盖 15 个 07-10～07-13 任务目录。当前 `master` 已在 `.trellis/tasks/archive/2026-07/` 下保存这些任务；其内容 blob 可在历史中找到。恢复旧活跃路径会产生重复任务树。
- `apps/core-app/pnpm-lock.yaml` 为约 31k 行的独立 lockfile，当前 `master` 不采用该路径；单独恢复会造成锁文件来源分裂。
- 5 个二进制文件是 `docs/engineering/reports/.../*.png` 的历史验证截图；它们属于证据附件，不是运行时源码。没有依据表明需重新灌入当前文档结构。
- `apps/nexus/build/` 下 9 个文件是构建脚本/测试，不应仅凭目录名当作生成物；但这些 blob 已进入或被后续构建体系演进，无独立恢复必要。

### 4.5 风险与分类

- **风险极高**：跨 484 个后续提交、854 个 diff 记录，覆盖 AI runtime、插件安全、搜索、更新、Nexus、TuffEx、传输协议和任务记录；整体恢复必然把已迁移或已删除架构重新引入。
- stash 描述中的“756 changes”低于当前 Git 对象实际审计出的 854 diff 记录，说明不能依赖标题估算范围。
- **独立价值**：作为 2026-07-14 优化集成节点的灾备快照仍有取证价值；没有发现当前应选择性恢复的源码。
- **分类**：**仅保留备份**（核心成果已吸收/演进）。
- **处置**：禁止整体恢复；若未来确有考古需求，只能按固定对象 ID、单路径提取并在隔离环境验证。当前不建议列入本次代码整合。

## 5. `stash@{2}`：优化集成前用户工作快照

### 5.1 元数据与范围

- 对象：`907c8510bb4203731398dd105d3872262c13cac7`
- 创建：2026-07-13 19:05:20 -07:00
- 标题：`On master: pre-optimization-integration-user-work`
- 基线：`b95604d86b0d489fa060bd079b83a1cf4b06daf4`，2026-07-10 20:56:04 -07:00，`chore: record journal`
- 基线已包含于 `master`；基线至当前 `master` 共 496 个提交。
- `git stash show --include-untracked`：819 个 diff 记录，+112,779/-23,152，5 个二进制文件；底层为 595 个 tracked 变更路径和 225 个 untracked tree 路径。
- 主要模块：
  - `apps/nexus`：409
  - `apps/core-app`：143
  - `.trellis/tasks`：116
  - `packages/utils`：48
  - `packages/tuffex`：26
  - `docs/plan-prd`：19
  - `docs/engineering`：14
  - 其余 AI、插件、测试、CLI 模块约 44

### 5.2 文件级吸收情况

合并 tree 后共审计 820 个路径：

- **261** 个与当前 `master` 完全相同。
- **489** 个 stash blob 曾在 `master` 历史中完全出现，随后演进、移动或移除。
- **70** 个从未以完全相同 blob 进入 `master`。

前两类已直接覆盖 **750/820（91.5%）**。第三类比 `stash@{1}` 多，原因是该 stash 更早，后续 `stash@{1}` 与优化集成本身继续修改了大量相同模块，并不表示存在 70 个独立缺失功能。

### 5.3 与 `stash@{1}` 的关系及语义判断

- 两个 stash 共享相同的核心工作主题与绝大多数模块；`stash@{1}` 创建晚约 6 小时 27 分钟，规模增加 35 个 diff 记录。
- 两个完整快照之间仍有 291 个文件变化（+26,790/-19,384），表明它们是连续但非可直接叠加的 WIP 阶段；不能把两个 stash 依次恢复。
- `stash@{2}` 的独有/不同内容主要落在后来持续重构的模块：
  - AI 配置、provider、assistant image translate
  - QuickOps runtime host
  - CoreBox 与截图翻译
  - Nexus admin/analytics/store
  - Intelligence plugin、SDK 和 transport types
- 这些区域在 `master` 中已有大量后续提交；关键替代证据与 `stash@{1}` 相同：
  - `7faea27bf`：Intelligence 错误与配额治理整合
  - `5427d65fa`：编排切到 Pi runtime
  - `44544d09a`：退休 legacy CLI shims
  - `2cf1c7cd2`：权限服务加固与迁移
  - `f184d0966`：版本化 native screenshot workflow
  - `065868219`：规划文档合并清理
- 与 `stash@{1}` 完全相同的旧截图框选组件、116 个 Trellis 任务文件、独立 `apps/core-app/pnpm-lock.yaml` 和 5 个历史 PNG 证据附件，具有同样的重复/陈旧风险。

### 5.4 风险与分类

- **风险最高**：这是四个 stash 中基线第二旧、跨模块最广的一类，距当前 496 个提交；其 70 个非精确 blob 多集中在后来发生架构迁移的核心路径。
- **独立价值**：仅保留“优化集成前用户工作”这一时间点的历史保险价值。它不是 `stash@{1}` 的干净父补丁，也没有发现可脱离旧架构验证的候选成果。
- **分类**：**仅保留备份**。
- **处置**：不得整体恢复，也不建议本次选择性恢复。若未来决定压缩备份数量，应先由用户确认 `stash@{1}` 是否足以替代其灾备目的，再另行批准删除；本次不删除。

## 6. `stash@{3}`：Nexus 管理台旧快照

### 6.1 元数据与范围

- 对象：`bc4a2f4ef824556a563b0481aa9a372cbcf948e5`
- 创建：2026-06-21 22:06:48 +08:00
- 标题：`lint-staged automatic backup`（对象提交主题为 `WIP on master: a6ee6f983 ...`）
- 基线：`a6ee6f983d40a954dee572796964482c9fbad531`，2026-06-21 22:04:05 +08:00，`feat(tuffex): enhance data table layout controls`
- 基线已包含于 `master`；基线至当前 `master` 共 593 个提交。
- 24 个文件，+3,230/-3,003；无 untracked 第三父提交、无二进制文件。
- 主要模块：`apps/nexus` 23 个，`docs/plan-prd/01-project/CHANGES.md` 1 个。
- 主要能力：Provider Registry 管理界面、Intelligence Admin、analytics、scene orchestration、dashboard 路由与 i18n。

### 6.2 吸收证据

- **6/24** 个文件与当前 `master` 完全相同：
  - `apps/nexus/app/pages/dashboard/admin/credits.vue`
  - `apps/nexus/app/pages/dashboard/admin/users.vue`
  - `apps/nexus/app/pages/dashboard/credits.vue`
  - `apps/nexus/server/utils/devStylesheetDedupe.ts`
  - `apps/nexus/server/utils/sceneCapabilityAdapterRegistry.ts`
  - `apps/nexus/server/utils/tuffIntelligenceCapabilityMessages.ts`
- **14/24** 个 stash blob 曾在 `master` 历史中完全出现，之后继续演进。
- 余下 **4/24** 个没有完全相同 blob，但路径均有明确后续提交：
  - `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
  - `apps/nexus/app/utils/provider-registry-admin.test.ts`
  - `apps/nexus/server/utils/sceneOrchestrator.ts`
  - `apps/nexus/server/utils/sceneOrchestrator.test.ts`

关键提交紧随 stash 基线发生：

- `152a9b7b4`（2026-06-21 22:08:38 +08:00）`feat(nexus): rebuild provider registry admin workspace`
- `ebc26e9da`（2026-06-21 22:09:08 +08:00）`feat(nexus): add intelligence scene text adapters`
- 后续继续演进：`38d0b114e`、`4844185aa` 等 provider registry 控制与可观测性提交。

这说明 stash 是提交前几分钟的自动保险副本；其语义成果已在随后提交进入仓库，并继续演进。

### 6.3 风险与分类

- **风险**：整体恢复会把 Provider Registry、scene orchestration、analytics 与 i18n 回退至 593 个提交前的版本；最大差异文件包括 `tuffIntelligenceLabService.ts`、两个 Admin Panel 和旧 `CHANGES.md`。
- **独立价值**：无当前独立源码价值，仅有历史快照价值。
- **分类**：**已吸收**。
- **处置**：不要恢复；可在用户批准后删除。

## 7. 最终处置矩阵

| 对象 ID 前缀 | 已吸收 | 候选选择性恢复 | 仅保留备份 | 可在用户批准后删除 |
|---|---:|---:|---:|---:|
| `5291ff49e` | 是 | 否 | 可选 | 是 |
| `d2b03eaf5` | 核心成果是 | 否 | **是** | 暂不建议；若不再需要灾备可另行批准 |
| `907c8510b` | 核心成果是 | 否 | **是** | 暂不建议；先确认较新备份覆盖需求 |
| `bc4a2f4ef` | 是 | 否 | 可选 | 是 |

### 推荐顺序

1. 本次整合阶段：**不从任何 stash 恢复源码**。
2. 保留 `stash@{1}`、`stash@{2}` 作为历史保险，不让其进入 `master`。
3. 若用户后续要求清理 stash：优先考虑删除已明确吸收的对象 `5291ff49e...` 与 `bc4a2f4e...`；删除仍需单独明确批准。
4. 对两个大 stash 的任何未来取证，使用固定对象 ID 并在隔离 worktree/临时分支中按单路径验证，禁止 `stash pop`。

## 8. 工作区完整性

审计前后 `git status --short --branch` 的源码状态保持不变：`master...origin/master`，仅当前 Trellis 任务目录为未跟踪内容。报告本身是本任务允许写入的唯一新增研究产物；未触碰 stash、分支、索引或源码文件。
