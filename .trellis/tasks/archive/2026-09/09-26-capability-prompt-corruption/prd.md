# 对话能力提示词被写成能力 ID（聊天变翻译）

父任务：`09-25-home-session-polish`。2026-09-26 老板反馈：Home 对话里助手一直在翻译（「hi」→「嗨 / 你好」，「你可以做啥？」→ 英文 +「当前是翻译模式」），多个对话标题带「翻译」。

## 证据（2026-09-26 主会话只读排查）

- dev 数据目录 `~/Library/Application Support/@talex-touch/core-app/tuff-dev/modules/config/aisdk-config`（最后写入 2026-09-25 18:12:15）：
  - `capabilities["text.chat"].promptTemplate === "text.translate"`
  - `capabilities["text.translate"].promptTemplate === "text.chat"`
  - `promptRegistry` 里 `capability.text.translate.default` 的 `template === "text.chat"`
- `legacy-backups/app-config-v1/aisdk-config`（2026-07-18）：`text.chat` 无 promptTemplate，`text.translate` 为正常的「你是专业翻译助手。请将以下文本翻译成 {{targetLang}}，只返回译文，不要解释。」
- 默认值 `packages/utils/types/intelligence.ts`：`text.chat` 不带 promptTemplate；`text.translate` 带上面那句模板。
- 模型收到的系统提示词就是字面上的 `text.translate`，于是自称「翻译模式」。
- 记忆表 `intelligence_memory_items` 为空（不是记忆导致）；`intelligence_audit_logs` 为空。

## Requirements

1. **定位写坏的代码路径**（证据说话）：谁把能力 ID 写进了 `promptTemplate` / 提示词库 `template`。线索：设置页能力提示词自动保存（`IntelligenceCapabilityInfo.vue` 的 `flushPrompt` / `watch(() => props.capability.id)`，提交 `da593d482`）、`IntelligenceCapabilitiesPage.vue` 的 `onUpdatePrompt` / `handleCapabilityPrompt`、主进程 `intelligence-config.ts` 的 `syncPromptSchema` / `resolveCapabilityPromptTemplate` / `resolveIntelligencePromptTemplate`、各种迁移（startup-migrations、legacy 备份迁移）、`IntelligencePromptsPage.vue`。修掉根因并加回归测试（能复现「切换能力 / 保存后 promptTemplate 变成另一个能力 ID」的测试在修复前失败、修复后通过）。
2. **自愈**：主进程加载配置时，识别被写坏的提示词——值恰好等于某个已知能力 ID（或形如 `a.b` 的纯标识符、不含空白）——对该能力恢复默认模板（有默认就用默认，没有就清空），提示词库里同样的坏记录一并修复；只修这一类明确损坏，不动用户正常写的提示词。修复写回配置、打一条 warn 日志。加单测。
3. 不直接改老板的数据文件；修复随下一次主进程启动生效（需要重启 dev，主会话会先征得老板同意）。

## Acceptance Criteria

- [x] 根因的代码位置与复现步骤写进本 PRD 的「结论」一节。
- [x] 回归测试：修复前失败、修复后通过。
- [x] 自愈单测：`text.chat = "text.translate"` / `text.translate = "text.chat"` 这组输入恢复为默认；正常提示词不变。
- [x] core-app `tsc -p tsconfig.node.json`、`vue-tsc -p tsconfig.web.json`、相关 vitest、eslint 通过。

## 结论（2026-09-26）

### 根因

没有哪个提交的代码单独运行会把能力 ID 写成提示词。数据是在老板的 dev 实例里，由 da593d482 改 emit 签名时的 **HMR 错配** + **切换能力必写** 两件事叠加写坏的。

1. **da593d482 在同一个提交里改了子组件和页面两处**，把 `updatePrompt` 从 `[prompt]` 改成了 `[capabilityId, prompt]`：
   - 子组件 `IntelligenceCapabilityInfo.vue`（da593d482 版 :198）：`flushPrompt()` 改为 `emits('updatePrompt', props.capability.id, promptValue.value)`。`onBeforeUnmount`（:315）**无条件** flush，所以每次切换能力都会 emit，哪怕根本没编辑。
   - 页面 `IntelligenceCapabilitiesPage.vue`（da593d482^ 版 :274）的旧处理函数是 `onUpdatePrompt(prompt)` → `handleCapabilityPrompt(selectedCapability.value.id, prompt)`：它把**第一个参数当提示词**，写给**此刻选中**的能力。
2. **两半在运行时错配**：设置子页由 `AppShell.vue:202` 的 `<KeepAlive>` 缓存（`router.ts:156` `keepAlive: true`，key 为 `setting-intelligence-capabilities`）。Vue 的 HMR `reload()` 只调用 `instance.parent.update()`（`@vue/runtime-core@3.5.39` cjs :536）。如果能力页当时已停用（deactivated），它的父级是 KeepAlive，而 KeepAlive 只重渲染当前路由，缓存里的旧实例原样保留；下次进入时直接复用旧实例（:3011 `vnode.component = cachedVNode.component`）。缓存页内部的子组件则会随自己的 HMR 重新挂载成新代码。结果就是：**新子组件（emit `(id, prompt)`）+ 旧页面（`onUpdatePrompt(prompt)` 写给当前选中项）**。
3. 进入这个状态后，每点一次别的能力，被卸载的子组件就把「离开的能力的 ID」当作提示词交给旧处理函数，写到「新选中的能力」上：
   - 点 翻译 → `text.translate.promptTemplate = "text.chat"`；
   - 点回 对话 → `text.chat.promptTemplate = "text.translate"`。
   
   写入经 TouchStorage 自动保存（300 ms）落盘。主进程 `syncPromptSchema`（intelligence-config.ts:642/647）随后同步进提示词库（这时才首次创建 `capability.text.chat.default`）。`resolveIntelligencePromptTemplate` 优先读提示词库记录，所以模型收到的系统提示词就是字面上的 `text.translate`。

### 证据

- **数据形状**：两个能力恰好互换 ID——既不是自己的 ID，也不是提示词正文。这是「新 emit + 旧处理函数 + 切换必 flush」独有的特征。da593d482 之前的代码单独运行时，切换会把**提示词正文**串到下一个能力上（也就是 da593d482 修的那个 bug），写不出 ID。另外核对了真实配置：除这两个能力外，其余能力的提示词都等于默认值，没有正文串写的痕迹。
- **时间线**（OMP 会话 `~/.omp/agent/sessions/-Workspace-Projects-talex-touch/2026-09-15T03-48-40-616Z_*.jsonl`，时间为 UTC）：
  - 03:48–03:50Z：老板的截图显示，他自己的 dev 实例（v2.4.14-beta.38）开着 设置 › 能力 页。
  - 03:59:45Z 子组件 `flushPrompt` 改成 `(id, prompt)`；03:59:58Z 页面 `onUpdatePrompt(capabilityId, prompt)`；04:01:35Z 改 emit 声明。老板的实例（pid 62482，同一工作树上的 `electron-vite dev`）收到了这些 HMR。
  - 04:58:38Z：老板截图时在 模型渠道 页，说明能力页处于 KeepAlive 缓存中。
  - 提示词库两条坏记录的 `updatedAt` 都是 `1789448376487`（2026-09-15 12:59:36.487 +0800）。这与另一个会话 04:59:36.34Z 修改 `router.ts` 只差约 150 ms：该修改不是 HMR 边界，会触发 full-reload，进而触发 `app-storage.ts:54` `window.onbeforeunload` → 所有 TouchStorage `saveSync()`。这只是主进程最后一次从渲染端快照重新同步提示词库的时刻，坏值在那之前就已经写入。
  - 如果 03:59:58Z 页面 HMR 时能力页处于激活态，页面会被替换，卸载时会把当前能力写成**它自己的** ID（见下面实验的 active 模式）。老板的数据里没有这种情况，这与「当时能力页在缓存中」一致。
- **复现实验**（仓库外，`/tmp/cap-hmr-experiment/run.cjs`，直接用 core-app 的 vue 3.5.39 + `__VUE_HMR_RUNTIME__`）：
  - cached 模式：能力页停用在 KeepAlive 里时，依次 `reload(child)`、`reload(page)`；回到能力页后点 对话→翻译→对话，得到 `{"chat":"text.translate","translate":"text.chat"}`，与老板的数据一致。复用的页面实例仍是旧契约。
  - active 模式：页面被替换成新契约，卸载时写成 `text.chat = "text.chat"`，之后切换不再串写。

### 复现步骤

- **原场景**：`pnpm core:dev` 下打开 设置 › 能力 → 切到别的设置子页，让能力页进入 KeepAlive 缓存 → 按 da593d482 的顺序热更新子组件、再热更新页面 → 回到能力页，不编辑任何内容，点 翻译 再点回 对话。
- **单测复现**：`IntelligenceCapabilityInfo.test.ts` › `intelligenceCapabilityInfo capability switch`。它按页面的方式（按选中项 key）渲染编辑器，挂上 da593d482 之前的页面处理函数，再切换 对话→翻译→对话。

### 修复

1. **`IntelligenceCapabilityInfo.vue`：只写真实编辑。**
   - `savedPrompt` 记住存储里的值，`draftOwner` 记住草稿所属的能力。
   - `flushPrompt()` 只在草稿与 `savedPrompt` 不同时 emit，并用 `draftOwner` 作为能力 ID。
   - 存储推来的值不再回写。原来的 `syncingFromProps` 标志在异步 watcher 下从未生效，每次同步都会在 800 ms 后回写一次，现已删除。
   - 编辑器被复用到另一个能力时，先把旧草稿按旧 ID flush。
   
   现在切换能力不产生任何写入。所以不管页面处理函数长什么样（包括 KeepAlive 残留的旧实例），单纯点击都不可能再写坏数据。
2. **`intelligence-config.ts` `repairIdentifierOnlyPrompts()`：自愈。** 在 `patchStoredConfigDefaults` 里、`syncPromptSchema` 之前调用，启动加载和每次配置变更都会执行。

### 自愈判定

- **损坏的定义**：值 trim 后恰好等于某个已知能力 ID（`DEFAULT_CAPABILITIES` 与配置中的能力键），或者匹配 `^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$`（小写、点分、无空白的纯标识符）。
- **能力**：有默认模板就恢复默认，没有就删掉 `promptTemplate`。
- **提示词库**：模板是纯标识符的记录直接删除，由随后的 `syncPromptSchema` 按修复后的能力模板重建。`text.translate` 会得到默认模板记录；`text.chat` 没有模板，也就没有记录。
  - 必须删记录：解析器优先读记录，而 `syncPromptSchema` 不会碰「没有模板的能力」的记录。临时禁用删记录这一步后验证过：只修能力不修记录时，`text.chat` 仍然解析出 `text.translate`。
- **写回与日志**：只有发生了修复才写回，并打一条 warn：`Repaired capability prompts that had been overwritten with an id`，内容包括能力 ID、原值、`restored`（`default`/`cleared`）和被删的记录。下一次加载已无可修复的内容，不会再告警。
- **不动的情况**：含空白或任何 ID 不可能包含的字符时一律不动。单测覆盖了句中含 `text.chat`、`{{text}}`、`Explain.`、自定义翻译提示词这几种。
- **真实数据 dry run**：在老板真实配置的只读副本上跑了一遍（`/tmp/cap-evidence/heal-dry-run.json`）。
  - 只改了两个能力：`text.chat` 清空，`text.translate` 恢复默认。
  - 提示词库 18 → 17 条：删掉两条坏记录，重建翻译的默认记录。
  - 其余字段零差异。
  - 修复后 `text.chat` 解析为无系统提示词，`text.translate` 解析为默认翻译提示词。
  - 原数据文件未改动（mtime 仍是 2026-09-25 18:12）。

### 测试

- **`IntelligenceCapabilityInfo.test.ts`：+4 用例。**
  - 切换复现：修复前 `writes = [['text.chat',''],['text.translate','text.chat']]`，存储变成互换 ID；修复后没有写入。
  - 只查看，不写入。
  - 存储推入的值不回写（fake timers，越过 800 ms 防抖）。
  - 编辑器被复用时，旧草稿按旧 ID flush。
  - 这些断言通过 `onUpdatePrompt` 监听器记录写入，因为 VTU 的 `unmount()` 会先清空该组件的 `emitted()` 历史。
  - 结果：HEAD 组件 4 fail / 7 pass，修复后 11/11。
- **`intelligence-config.test.ts`：+3 用例。**
  - 互换 ID 恢复，含 warn 与幂等检查。
  - 不是能力 ID 的点分标识符（`chat.completion`）同样被修复。
  - 正常提示词不动。
  - 结果：去掉自愈调用时互换用例失败（`text.chat` 仍解析为 `text.translate`），恢复后 25/25。

### 另见（当时未修；两项已按下文「追加」第 4、5 条修复，见文末「结论（追加 4、5）」）

- **`promptBindings` 里的循环引用占位字符串**：老板配置里有一条字符串 `"[Circular ~root.data.data.capabilities.text.chat.promptBinding]"`。
  - 成因：`syncPromptSchema` 首次为某个能力建 binding 时，把**同一个对象**既推进 `promptBindings`，又赋给 `capability.promptBinding`（intelligence-config.ts:642/647）。通道序列化用的 `structuredStrictStringify`（packages/utils/common/utils/index.ts:144）的 `seen` 表只增不减，会把「重复引用」当成循环引用，替换成字符串；渲染端保存时又把它写回了磁盘。
  - 影响：运行时无害，解析器按 `capabilityId` 匹配时会跳过它。
- **KeepAlive 缓存页在 HMR 后仍跑旧代码**：这是通用的 dev 隐患。老板把 dev 当日常使用，数据是真数据；以后再改任何 emit/props 契约，缓存中的页面仍会跑旧的处理函数。
- **生效方式**：主进程代码要重启 dev 才生效。重启后首次加载就会自愈并写回，不需要手工改数据文件。

## 追加（2026-09-26 老板：「修复一下12」）

4. **序列化把重复引用标成循环**：`packages/utils/common/utils/index.ts:144` 的序列化把同一对象的第二次引用输出成 `"[Circular ~…]"` 字符串，`syncPromptSchema`（`intelligence-config.ts:642/647`）又把同一个 binding 对象放在两处，于是 `promptBindings` 里出现 `"[Circular ~root.data.data.capabilities.text.chat.promptBinding]"`。
   - 序列化只把真正的环（祖先链上的对象）当循环；同一对象被多处引用时正常输出。加单测（DAG 共享引用原样输出、真环仍被截断、深度/大小限制等原行为不变）。
   - `syncPromptSchema` 不再让同一个对象出现在两个位置（写入副本）。
   - 加载时自愈：`promptBindings` 等应为对象的数组里的 `"[Circular …]"` 字符串条目删除（写回 + warn）。
   - 排查影响面：这个序列化器还被哪些持久化路径使用；老板 dev 数据目录里（只读）还有哪些文件含 `[Circular ~`，列在「结论」里。
5. **dev 下 KeepAlive 缓存页热更新后仍跑旧代码**（`AppShell.vue:202`）：仅 dev（`import.meta.hot`），每次 `vite:afterUpdate` 后清掉 KeepAlive 里处于缓存、当前未显示的实例（例如短暂把 `exclude` 设为全匹配再恢复，Vue 的 pruneCache 会跳过当前实例），下次进入用新代码重建；当前显示的页面照常热更新、不重建、不丢状态。正式构建不包含这段逻辑。加测试（能证明缓存中的实例在热更新事件后被清掉、当前实例保留）。

## 结论（追加 4、5）（2026-09-26）

### 先更正：配置的真实存放位置

- 配置的主存储是 SQLite：`modules/database/database.db` 的 `app_config_entries` 表，`aisdk-config` 行（revision 52）。
- `modules/config/aisdk-config` 这个 JSON 是 legacy 后端文件，只在 SQLite 初始化失败回退时才读写，所以 mtime 停在 2026-09-25 18:12。上文「证据」「dry run」读的都是这个 legacy 副本。
- 实时那一行在今天 11:53 重启 dev 时已被第 1 轮自愈修好，有指纹为证：
  - `text.chat` 无提示词，`text.translate` 为默认模板；
  - 提示词库 17 条，翻译记录排在末尾，`updatedAt` = 11:52:55。
- 注意日志：`intelligence-config` 模块的日志不进 `D.<date>.log`（连每次启动都会打的 auth transition 也没有），所以日志里看不到那条 warn。

### 4. 序列化器把共享引用标成循环

**改动**
- **`packages/utils/common/utils/index.ts` `structuredStrictStringify`**：
  - 全局 `seen` 表改成「祖先链」`ancestors`：进入对象时登记，出来时在 `finally` 里删除。
  - 只有祖先链上的对象才输出 `[Circular ~路径]`。同一对象经其他分支再次出现时完整输出，与 `JSON.stringify` 一致。
  - 其余行为不变：`undefined`→`null`，Date/Map/Set/Error 转换，symbol/BigInt/WeakMap/函数按路径抛错。
  - 这个函数本来就没有深度/大小限制，所以没有这方面的行为需要保持。
- **`intelligence-config.ts` `syncPromptSchema`**：`upsertPromptBinding(…, cloneValue(binding))`，`capability.promptBinding = cloneValue(…)`，两个位置各写一份副本。
  - 修复前，每次给能力新建 binding 都是同一对象挂两处。单测里一个 fresh 配置有 18 个能力是这种共享引用。
- **`intelligence-config.ts` `dropCircularPlaceholders()`（加载时自愈）**：
  - 在 `patchStoredConfigDefaults` 开头执行，早于任何遍历这些数组的补丁。
  - 删掉 `providers`、`promptRegistry`、`promptBindings`、各能力 `providers` 里的 `"[Circular ~…]"` 字符串条目；能力的 `promptBinding` 本身是占位串时，删掉该字段（随后 `syncPromptSchema` 会从列表补回副本）。
  - 发生删除才写回，并打 warn `Dropped serializer placeholders from the intelligence config`，附上位置和原串。

**影响面排查（序列化器的所有调用方）**
1. **`apps/core-app/src/main/core/channel-core.ts`**（:473 no-handler reply，:550/:580 handler reply，:806 send，:1005 broadcast，:1069 plugin broadcast，:1118 日志预览）：主进程发往渲染端和插件的全部 IPC 载荷都经过它。
   - 这就是本次写坏数据的持久化路径：主进程缓存的配置对象含共享引用 → `getVersioned` 回复里第二处变成占位串（路径前缀 `root.data.data` 正是 reply envelope）→ 渲染端 TouchStorage 整对象存回 → 落盘。
   - 任何主进程持有、会被渲染端读回再保存的配置都有同样风险；按下面的扫描结果，目前只有 aisdk-config 中招。
   - 修复后共享引用会完整展开，DAG 很多的载荷会比以前大（与 `JSON.stringify` 一致）。
2. **`apps/core-app/src/main/modules/ai/ai-cli-orchestrator.ts:120` `digestStructuredValue`**：run metadata 里持久化的 `profileAuthorityDigest` / `requestInputDigest` / `automationPolicyDigest` 用它算哈希，恢复 run 时会重算比对。
   - 从 JSON/DB 读出的值不含共享引用，所以已持久化的摘要不变。
   - 修复还消除了一个隐患：内存里带共享引用的 input 和它经 DB 往返后的副本，以前会算出不同摘要（进而报 `AI_RUN_INPUT_UNAVAILABLE`），现在一致。
3. **`packages/utils/plugin/node/logger-manager.ts:155`**：插件日志 JSONL 写盘。以前共享引用在日志里是占位串，现在是完整数据。日志只读不回写，无害。

**老板 dev 数据只读扫描（`grep -a -F "[Circular ~"`）**
- dev profile `core-app/tuff-dev`：
  - `modules/database/database.db`：只有 `app_config_entries['aisdk-config']` 一处（`promptBindings[17]`）。
  - `modules/database/database.db-wal`：第一次扫描时命中过（同一行的 WAL 帧），checkpoint 后已为 0。
  - `modules/config/aisdk-config`（legacy JSON）：同一串一处。
  - 同一 profile 其余文件为 0。
- 其余：
  - dev app 的 Chromium 存储（Local Storage / Session Storage / Partitions / blob_storage / backups / temp）：0。
  - 另外两个 profile（`core-app/tuff/{modules,config}`、`core-app-dev/tuff-dev/modules`）：0。
- 全部占位串都是同一个 `[Circular ~root.data.data.capabilities.text.chat.promptBinding]`。
- **真实数据 dry run**：用实时行的只读副本跑了一遍（`/tmp/cap-evidence/heal-dry-run-2.json`）。
  - 只删 `promptBindings[17]` 一条（19 → 18），其余字段零差异；
  - 修复后按通道 envelope 序列化不再含 `[Circular`。
  - 下次重启 dev 后，实时行会自动修复。

**测试**
- `packages/utils/__tests__/structured-strict-stringify.test.ts`，6 例：
  - DAG 两分支、数组内重复引用都完整输出；
  - 真环、以及「共享对象内含自环」按各自分支路径截断；
  - 原有转换与抛错行为不变。
  - 结果：HEAD 序列化器 3 失败 / 3 通过（失败的正是共享引用类用例），修复后 6/6。
- `intelligence-config.test.ts` +2 例：binding 各自独立（撤掉副本写入时 18 个能力共享引用，失败）；占位串被删、字段被补回、warn 与写回（去掉自愈时失败）。

### 5. dev 下 KeepAlive 缓存页热更新后仍跑旧代码（已按协调要求收窄：只清「自己的组件在本次更新里」的缓存页）

**改动**
- **`apps/core-app/src/renderer/src/modules/layout/useKeepAliveHmrPrune.ts`**，每次 `vite:afterUpdate`：
  1. 从 payload 的 `updates[].path` / `acceptedPath` 取出本次替换的文件：
     - 只看 `js-update`；
     - 去掉查询串，把 `/@fs/…` 和 Windows 盘符还原成绝对路径；
     - 跳过 `?vue&type=style` 子模块：样式按 CSS 替换，不会留下旧实例，这样只改样式不会拆掉 Home。
     - `.ts` 模块的改动会以接受它的 `.vue` 边界出现在 `path` 里，所以依赖改动同样覆盖到页面。
  2. 用 `router.getRoutes()` 找出 `meta.keepAlive` 路由的组件（懒加载路由首次访问后，vue-router 会把 loader 换成组件对象）。按 dev 下 SFC 编译器打的 `__file` 与更新文件匹配，取 KeepAlive 实际用来比对的名字 `name || __name`。
     - 名字来自组件对象本身，不从文件名推，因为 setup-extend 会用 `<script setup name>` 设 name。
  3. 有命中时，把 `exclude` 设成这些名字，渲染一轮再清回 `undefined`：
     - KeepAlive 的 `pruneCache` 只卸载这些名字的缓存实例；
     - `pruneCacheEntry` 永远跳过当前页，当前页随后重新进缓存；
     - 没命中时什么都不做，连一次重渲染都没有。
- **`AppShell.vue`**：`import.meta.hot ? useKeepAliveHmrPrune(import.meta.hot, useRouter()) : undefined`，`<KeepAlive … :exclude="keepAliveExclude">`。
  - `useRouter()` 在三元表达式的 dev 分支里，正式构建一并删除。
  - AppShell 本轮只保存了一次：先在 /tmp 用 stdin 跑 prettier/eslint，再用临时探针文件跑 vue-tsc，全部通过后与 composable 在同一条命令里各写一次。

**与实际 dev 服务器核对**
- 只读 `GET :5173/src/views/base/intelligence/IntelligenceCapabilitiesPage.vue`，结果：
  - 模块以 `_export_sfc(_sfc_main, [..., ["__file", "/Users/…/apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceCapabilitiesPage.vue"]])` 导出；
  - `name: "IntelligenceCapabilitiesPage"`。
- 更新 payload 的 `path` 就是该页的 root 相对 URL，`__file.endsWith(path)` 能对上。

**正式构建**
- 同一表达式的最小 Vite 7.3.6 构建产物：`const keepAliveExclude = void 0`，composable 与 `useRouter()` 调用均不存在（composable 代码 0 处）。
- 去掉守卫的对照构建命中 5 处。

**测试**（`useKeepAliveHmrPrune.test.ts`，jsdom、真实 KeepAlive，路由桩返回带 `__file` 的页面，共 7 例）
- 无更新时缓存页保留状态。
- **无关更新什么都不清**：页面内子组件 `IntelligenceCapabilityInfo.vue` 和 `.ts` 模块的更新都不会卸载任何页面，Home 状态保留。
- **只清自己被更新的缓存页**（事故场景）：能力页在缓存中、文件被更新时，只有它被卸载；再次打开是新实例；Home 与当前页不动。
- **当前页永不被清**：即使更新的正是当前页的文件，也不卸载、状态保留，离开再回来仍是同一实例。
- 只改样式的更新不清。
- `/@fs/` 路径能匹配。
- 卸载后监听被移除。
- 两个方向的对照：
  - 跑在上一版「全清」实现上，3 例失败（无关更新和样式更新都会拆掉 Home）；
  - 跑在「从不清」的对照实现上，事故用例与 `/@fs` 用例失败。
- **真 HMR 实验**（`/tmp/cap-hmr-experiment/run-prune-named.cjs`）：Home 带草稿停在缓存里，能力页两次 `reload` 后按名字清理，结果：
  - 能力页再次进入是新契约，点切换不再互换写 ID；
  - Home `mounts=1`，草稿 `"mid-reply draft"` 原样保留。

**已知边界**
- **只改模板也会清**：HMR 事件分不清只改模板（Vue 已能原地更新缓存实例）还是改了脚本，这时该页也会被清掉。只多一次重建，不影响其他页面。
- **同名组件会一起清**：两个不同的缓存页组件如果同名，会一起被清。目前路由页面没有重名。
