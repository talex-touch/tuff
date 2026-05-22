# 微审计 61/70

- 审计主题

Raycast / Alfred Snippets Dynamic Placeholders 与 Tuff `touch-snippets` 的具体映射：当前 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}` 是否已经等价于 Raycast 统一 Dynamic Placeholders / Alfred workflow variables，还是只能算片段插件内的局部占位符闭环，并需要后续 `TuffVariableContract v1` 承接。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
   - 第 2.1 节确认 Raycast Snippets 包含 tags、keyword auto-expansion、`{date}`、`{time}`、`{clipboard}`、`{cursor}`、`{random}`、`{calculator}` 等 Dynamic Placeholders。
   - 第 3 节把 Tuff Snippets 写成“已落地但仍需产品化”：当前支持搜索、复制、保存、分享包和 4 个 placeholder，但 hot string / autopaste / cursor / browser-tab / calculator 后置。
   - 第 4 节把 `snippets-placeholder-v1.1` 定为 P1 小切片，要求先固化 placeholder contract，再评估 hot string / autopaste / cursor / browser-tab。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - 第 1 节把 Quicklinks、Snippets、AI Commands、command arguments 归为同一套参数填充体验。
   - 第 2.3 节明确 Tuff 当前 `touch-snippets` 只是在插件内支持 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`，建议后续映射到 `TuffParameterSet`，而不是继续扩大硬编码替换。
   - 第 4.3 节要求 `clipboard` placeholder 需要 permission reason；无权限或无内容时应有 evidence，不应替换为空字符串后伪装成功。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
   - 第 1 节把 Raycast 的统一 placeholder 心智、Alfred 的 workflow 变量生命周期、uTools 的输入类型匹配归纳为 Tuff 参数模型的三个来源。
   - 第 3 节把 `touch-snippets` 当前 placeholder 归为散点能力：可用，但失败态和隐私等级不统一。
   - 第 5.1 节要求 `TuffVariableContract v1` 兼容旧 `{{date}}` 等语法，同时新增统一 `{date}` / `{selection | trim}` 等语法，并保证缺参、无权限、provider 不可用时返回 blocked / failed reason。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 7 条确认 Snippets 当前能力没有被夸大：4 个 placeholder 是事实，后续 contract 优先于扩写插件。
   - 第 20 条确认 Snippets Dynamic Placeholders 与 Raycast 的差距已经明确：缺 `cursor`、`calculator`、browser-tab 等。
   - 第 54 条确认 legacy snippet syntax 应保留：`{{date}}` 等旧语法继续兼容，同时引入新合同。
5. `plugins/touch-snippets/manifest.json`
   - 插件声明 `sdkapi: 260428`，required permission 为 `clipboard.write`，optional permission 为 `clipboard.read`。
   - `permissionReasons.clipboard.read` 明确用于 `{{clipboard}}` 占位符与从剪贴板保存片段。
   - `snippets-search`、`snippets-save`、`snippets-manage` 三个 feature 均为 `acceptedInputTypes: ["text"]`，说明当前 snippet 输入仍是 text-only，不是 image/files/html 多源变量系统。
6. `plugins/touch-snippets/index.js`
   - `applyPlaceholders()` 只替换 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`；日期格式固定为 `YYYY-MM-DD`，时间固定为 `HH:mm:ss`，UUID 通过 `randomUUID()` 或测试注入工厂生成。
   - `readClipboardTextForContent()` 只有在内容包含 `{{clipboard}}` 时才请求 `clipboard.read`，符合最小权限读取方向。
   - `readClipboardText()` 在权限未授予或读取失败时返回空字符串；当前没有 `VARIABLE_MISSING` / `PERMISSION_MISSING` 这类稳定 failure code。
   - `onItemAction()` 执行复制时才读取 clipboard、调用 `applyPlaceholders()`、写入剪贴板并更新 `lastUsedAt` / `useCount`。
   - `createSnippetPack()` 默认过滤疑似 `api_key`、`secret`、`password`、private key、`sk-`、GitHub token、AWS key 等敏感内容，说明 CloudShare snippet pack 已有局部隐私保护。
7. `plugins/touch-snippets/index.test.cjs`
   - `applyPlaceholders resolves date time uuid and clipboard placeholders` 覆盖了 4 个 placeholder，并确认同一次替换中多个 `{{uuid}}` 复用同一个生成值。
   - `createSnippetPack filters sensitive snippets by default` 覆盖敏感片段默认过滤。
8. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffQuery.text` 与 `TuffQuery.inputs` 明确区分主动输入和剪贴板/附加输入，`TuffInputType` 已覆盖 text / image / files / html。
   - 当前 `TuffQuery` 没有 `variables` / `parameters` 命名空间，不能直接承载 Raycast / Alfred 式变量生命周期。
9. `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
   - Adapter 会按 `acceptedInputTypes` 过滤非 text 输入；text 和 html 被视为 text-like。
   - 这证明 `acceptedInputTypes` 可作为 Context Actions / 多输入匹配的底座，但它只表达“feature 能接收什么”，不表达 placeholder 如何声明、解析、校验、脱敏和失败。

- 结论

主文档对这个映射点的判断成立：Tuff `touch-snippets` 已经有可用的片段库与局部动态占位符能力，但当前还不能写成 Raycast Snippets Dynamic Placeholders 或 Alfred workflow variables 的完整对齐。

已经成立的部分很具体：

1. `touch-snippets` 是真实插件，不是占位文档；它能搜索、保存、复制片段，并维护 `lastUsedAt` / `useCount`。
2. `applyPlaceholders()` 对 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}` 有真实替换逻辑和单元测试覆盖。
3. `{{clipboard}}` 不是无条件读取剪贴板，只有片段内容实际包含该占位符时才请求 `clipboard.read`，且 manifest 把该权限列为 optional。
4. CloudShare snippet pack 默认过滤常见 secret pattern，说明“片段内容可分享”和“敏感内容不应明文扩散”的边界已有局部实现。
5. `TuffQuery.text` / `inputs` 与 `acceptedInputTypes` 提供了未来把 Snippets、Quicklinks、AI Commands、Translation 统一到变量合同的底座。

但差距也同样明确：

1. 当前 placeholder 是 `touch-snippets` 插件内部的 `replace()` 逻辑，不是跨 Quicklinks / Snippets / AI Commands / Translation 共享的 resolver。
2. 只支持 4 个旧语法 placeholder，缺 Raycast 已覆盖的 `cursor`、`calculator`、browser-tab、selection、argument modifiers、大小写转换、percent encode、JSON stringify 等能力。
3. `{{clipboard}}` 无权限、剪贴板为空或读取失败时会得到空字符串；这符合当前最小实现，但还不是主文档要求的 `VARIABLE_MISSING` / `PERMISSION_MISSING` / `SOURCE_UNAVAILABLE` 可见失败态。
4. Manifest 只有 `acceptedInputTypes: ["text"]`，没有 `parameters` / `variables` / `privacy` / `validation` / `modifiers` 字段；因此 CoreBox 不能在执行前展示缺参、来源、隐私等级或解析证据。
5. Alfred 式 workflow variable 生命周期仍未落地：没有 declare / collect / resolve / validate / transform / execute / evidence / expire 的统一链路，也没有 item-level variables 或 session variables。

因此，第 61 轮的准确结论是：`touch-snippets` 可以作为 `TuffVariableContract v1` 的首个落点，但不能把现有 4 个占位符直接宣传为 Raycast / Alfred parity。后续最小路径应保持主文档方案：保留旧 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}` 语法，抽薄 resolver，先新增统一 source、privacy、modifiers、failure reason 和 evidence；`cursor` 与 autopaste 必须等插入失败态明确后再做，避免把手动复制片段膨胀成系统级热字符串注入。

- 是否发现需修正的主文档问题

否。

`01`、`02`、`06` 与 `11` 对 Snippets Dynamic Placeholders 的表述与 live tree 一致：Tuff 当前已有 4 个局部 placeholder 与真实片段插件路径，但缺统一变量合同、缺 Raycast 的 cursor / calculator / browser-tab / argument modifiers，也缺 Alfred 式变量生命周期。主文档没有把 `touch-snippets` 夸大为完整 Dynamic Placeholders parity，因此不需要修正 `01-11` 主分析文档。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-61.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
