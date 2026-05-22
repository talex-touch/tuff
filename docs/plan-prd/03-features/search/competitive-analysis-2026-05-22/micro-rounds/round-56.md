# 微审计 56/70

- 审计主题
  - Nexus Store / CloudShare / CloudSync 的边界是否被主文档正确表达；重点核对 Tuff 是否把 Raycast Store / Alfred Gallery / uTools 插件市场的“公开生态资产分发”与用户私有同步混在一起。

- 读取/核对的文档或源码锚点
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
    - 第 2.2 节把 Alfred `.alfredworkflow` 分享映射到 Tuff `.tpex` 与 CloudShare content pack，并明确不能把用户私有同步数据伪装成公开内容包。
    - 第 3 节把 `.tpex` package preview、Package integrity、审核状态、Store 发现、CloudShare content pack、CloudSync 边界分成不同能力面。
    - 第 6 节明确 `.tpex` 完整性不等于恶意代码扫描，CloudShare 只发布用户明确选择的公开/团队内容，CloudSync 只同步用户私有加密数据。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
    - Storage / Sync / Security 行把 `/api/v1/sync/*`、`payload_enc` / `payload_ref`、SQLite 本地 SoT 与禁止明文 JSON dump 写成同步边界。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 66 条确认 CloudShare 与 CloudSync 没被混淆。
    - 第 69 条确认 CloudSync SDK 与服务端类型使用 `payload_enc` / `payload_ref`，文档禁止明文 JSON dump 的口径正确。
  - `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`
    - 明确 `CloudSyncSDK` 是“我的数据，在我的设备间同步”，`CloudShareSDK` 是“我选择发布的数据，供别人预览、安装、订阅或 fork”。
    - 明确公开内容不写进 `/api/v1/sync/*`，`touch-snippets` 的 `snippet-pack` 是首条验证链路。
  - `packages/utils/cloud-share/cloud-share-sdk.ts`
    - `publish()` / `list()` / `get()` / `install()` 全部走 `/api/store/plugin-content*`，发布需要 auth，公开读取和安装数递增不使用 CloudSync 路径。
  - `packages/utils/cloud-share/snippet-pack.ts`
    - `SNIPPET_PACK_FORMAT = 'tuff.snippet-pack+json'`、`SNIPPET_PACK_KIND = 'snippet-pack'`。
    - `createSnippetPack()` 默认过滤疑似 `api key`、`secret`、`password`、`token`、private key、OpenAI `sk-*`、GitHub PAT、AWS key 等敏感片段，并记录 `skippedSensitiveCount`。
  - `packages/utils/types/cloud-sync.ts` 与 `packages/utils/cloud-sync/cloud-sync-sdk.ts`
    - `SyncItemInput` / `SyncItemOutput` 只有 `payload_enc` / `payload_ref`，没有明文业务 payload 字段。
    - SDK 请求路径是 `/api/v1/sync/handshake`、`/api/v1/sync/push`、`/api/v1/sync/pull`、`/api/v1/sync/blobs/*`。
  - `apps/nexus/server/utils/pluginContentStore.ts`
    - 内容包有 `visibility: private/unlisted/team/public` 与 `status: draft/pending/published/rejected`。
    - 未登录公开读取只返回 `published` 且 `public/unlisted` 的内容包；owner 可读自己的非公开内容。
  - `apps/nexus/server/utils/tpex.ts`
    - `.tpex` 解析会校验 `manifest._files` 的 SHA-256 map 与 `_signature`，但这是包完整性校验，不是恶意代码扫描。
  - `apps/core-app/src/main/modules/plugin/plugin-content-installer.ts`
    - 本地内容安装当前只接受 `targetPluginName === 'touch-snippets'`、`contentPackage.pluginId === 'touch-snippets'`、`kind === 'snippet-pack'`、`manifest.importTarget === 'touch-snippets'`、`manifest.format === 'tuff.snippet-pack+json'`。
    - 写入目标是本地插件文件 `snippets.json`，失败返回 `PLUGIN_STORAGE_WRITE_FAILED` 等明确错误码。
  - `apps/core-app/src/renderer/src/composables/store/usePluginContentPackages.ts`
    - 先通过 typed plugin SDK 执行本地 `installContent()`，本地写入成功后再调用 `/api/store/plugin-content/{id}/install` 同步安装数。
    - 安装数同步失败用 `INSTALL_COUNT_SYNC_FAILED` 单独表达，不会把本地写入成功伪装成失败。

- 结论
  - 主文档的边界表达成立：Tuff 应把竞品生态里的“公开资产分发”拆成 `.tpex` 插件包、Nexus Store 审核/展示、CloudShare 内容包三条线，而不是把插件内容、Snippets、Clipboard 或 App Data 当作 CloudSync 私有同步的一部分。
  - 当前源码也支撑这个边界：
    - CloudShare 是 Store content API：面向用户主动发布、公开/非公开可见性、安装数、内容包安装。
    - CloudSync 是私有加密同步 API：面向设备、token、quota、cursor、conflict、`payload_enc` / `payload_ref`。
    - CoreApp 内容包安装只做 `touch-snippets` 首条链路，符合文档中“先用 snippet pack 做 MVP evidence”的低风险路线。
  - 不能过度宣称的地方也被主文档压住了：
    - `.tpex` `_files` / `_signature` 只能证明包内容与 manifest 描述一致，不等于 Raycast Store 级别安全审核或恶意代码扫描。
    - CloudShare 当前内容包路径可支撑 MVP，但 public 内容审核、团队可见、订阅/fork、private/team ACL 仍是后续任务，不应写成完整生态闭环。
    - `snippet-pack` 敏感过滤是启发式过滤，不等于数据泄露防护的完整证明；发布前仍需要 Store 侧 risk badge / review evidence。

- 是否发现需修正的主文档问题
  - 否。`08`、`09`、`10`、`11` 对 Nexus Store / CloudShare / CloudSync 的区分是准确的：它们没有把 CloudShare 内容包误写成 CloudSync 私有同步，也没有把 `.tpex` 完整性校验夸大成完整安全扫描。现有缺口被正确放在 release evidence、审核反馈、能力卡、risk badge、团队/私有分发和 CloudShare review 后续项里。

- 本轮未改业务代码、未提交 git 的说明
  - 本轮只新增本微审计 Markdown 文件，并更新 codex-potter 进度记录。
  - 未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES。
  - 未执行 git commit、git push、创建分支、reset、checkout 或清理工作树。
