# 微审计 42/70

- 审计主题：CloudShare `snippet-pack` 是否被正确限定为“内容包安装”，而不是被误用为 `.tpex` 插件安装、CloudSync 私密同步或自动串联目标插件安装。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
    - 第 1 节把 CloudShare 写成 `touch-snippets` snippet pack 的内容包链路，并明确内容审核、团队可见、订阅/fork 后置。
    - 第 5.1 节把 Content pack install 的验收限定为把 `tuff.snippet-pack+json` 安装到本地插件存储，失败 reason 包括 `target-plugin-missing`、`unsupported-import-target`、`unsupported-content-format`、`storage-write-failed`。
    - 第 6 节明确 CloudShare 只发布用户选择的公开/团队内容，CloudSync 才是用户私有加密同步。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
    - 第 4.3 节将 `nexus-plugin-workflow-card-v1` 放在 `.tpex` / Store card / capability 展示路线中，未把内容包安装写成插件包安装。
    - 第 6 节要求不要把 JSON 当本地数据 SoT；JSON 只允许作为轻量配置或加密同步载荷。
  - `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`
    - 目标明确区分 `CloudSyncSDK` 与 `CloudShareSDK`：前者是“我的数据，在我的设备间同步”，后者是“我选择发布的数据，供别人预览、安装、订阅或 fork”。
    - CoreApp 首版安装边界写明：只支持 `touch-snippets` 的 `snippet-pack`；目标插件必须已安装；不自动串联插件安装；只接受 `manifest.importTarget === "touch-snippets"` 且 `manifest.format === "tuff.snippet-pack+json"`。
  - `packages/utils/types/cloud-share.ts`
    - `PluginContentPackage` 只描述 `pluginId`、`kind`、`visibility`、`manifest.importTarget`、`manifest.format`、`contentInline/contentRef`、`status`、`installCount` 等内容包元数据，没有插件包安装、权限授予、sdkapi 或 CloudSync payload 字段。
  - `packages/utils/cloud-share/snippet-pack.ts`
    - `TOUCH_SNIPPETS_PLUGIN_ID`、`SNIPPET_PACK_FORMAT`、`SNIPPET_PACK_KIND` 固定为 `touch-snippets` / `tuff.snippet-pack+json` / `snippet-pack`。
    - `createSnippetPack()` 默认过滤疑似 API key、secret、password、token、private key 等敏感内容。
    - `importSnippetPack()` 只把片段合并进本地 snippets store，并处理 id 冲突；不安装插件、不写 CloudSync。
  - `apps/core-app/src/main/modules/plugin/plugin-content-installer.ts`
    - `validateTouchSnippetsPackage()` 在读取目标插件前先校验 packageId、targetPluginName、contentPackage.pluginId、kind、manifest.importTarget、manifest.format 和 `contentInline`。
    - `installPluginContentPackageToLocalPlugin()` 只有在目标插件已安装后才读取/写入 `snippets.json`，失败返回 `TARGET_PLUGIN_NOT_INSTALLED` 或具体 storage 错误。
  - `apps/core-app/src/main/modules/plugin/plugin-content-installer.test.ts`
    - 覆盖成功导入、目标插件未安装、错误 target/format 不触碰 plugin storage、storage 写入失败四类关键边界。
  - `apps/core-app/src/renderer/src/composables/store/usePluginContentPackages.ts`
    - 前端安装链路先调用本地 `pluginSdk.installContent()`，本地成功后才调用 `/api/store/plugin-content/:id/install` 同步安装数；安装数同步失败不会伪装成本地写入失败。

- 结论：
  - 主文档对 CloudShare 的边界判断成立。当前 live tree 把 CloudShare snippet pack 处理成“插件内容包导入”，不是 `.tpex` 插件包安装，也不是 CloudSync 私密同步。
  - 安装链路的顺序是正确的：先校验内容包目标、格式和 inline 内容，再确认目标插件已安装，再写本地 `snippets.json`，最后才同步 CloudShare install count。这个顺序避免了“下载内容包时顺手安装插件”或“远端计数成功但本地失败仍显示成功”的假闭环。
  - 内容包合同仍是 MVP：它能承载 Raycast/Alfred/uTools 生态里的“可分享资产”心智，但目前只适合 `touch-snippets` snippet pack 这条链路。团队可见、审核、订阅/fork、大内容 `contentRef`、多插件内容包 schema 仍应按主文档后续切片推进。
  - 后续如果扩展到 Quicklinks、Workflow template 或 AI Command pack，应沿用当前模式：每种内容包必须有独立 `kind` / `format` / `importTarget` 校验、目标插件存在性检查、本地写入失败 reason，以及敏感内容过滤；不要把 CloudShare 变成通用 JSON 导入器。

- 是否发现需修正的主文档问题：否。`08`、`10` 与 CloudShare PRD 均没有把内容包安装夸大成完整插件安装或私密同步能力；它们把 CloudShare / CloudSync / `.tpex` 三者边界写得清楚，且与源码和测试一致。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-42.md` 和更新 `.codexpotter` 进度记录；未修改业务代码，未执行 git commit / push / branch / reset / checkout。
