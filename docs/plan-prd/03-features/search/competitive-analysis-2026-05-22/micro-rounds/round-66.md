# 微审计 66/70

## 审计主题

Nexus Store / Raycast Store / Alfred Gallery / uTools 插件市场里的“安装前包预览与信任校验”心智，是否能映射到 Tuff 当前 `.tpex` 包的 `_files` / `_signature` 完整性、package preview、publish 提交与 CoreApp 安装校验链路。

本轮只审一个窄点：Tuff 是否已经有真实 `.tpex` package integrity gate；同时确认主文档把缺口定位为“package preview / risk summary 产品化不足”，而不是误写成“完全没有包校验”或“已具备完整恶意代码审计”。

## 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
   - 第 1 节明确：Tuff 已有 `.tpex` 包预览、publish auth、版本审核状态和包内 `_files` / `_signature` 完整性校验，但 package policy / security scan 仍主要是规划和完整性校验，不能宣称 Raycast 式完整审核安全链。
   - 第 3 节把 `.tpex` package preview 与 Package integrity 拆开：preview 能解析 manifest / README / icon，integrity 能校验 manifest `_files` SHA-256 map 与 `_signature`。
   - 第 4 / 5 节要求后续补 package policy baseline、Store trust summary 和发布链路 evidence。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 14 条确认 `.tpex` integrity 与 `tuff validate` 存在，但不是完整恶意代码扫描。
   - 第 62 / 65 条分别把 Store capability card 和 version moderation 作为后续产品化缺口；本轮不重复审核这两块。
3. `packages/tuff-cli-core/src/exporter.ts`
   - `compressPlugin()` 会在打包前计算构建产物文件 SHA-256，写入 `manifest._files`，并用 `generateSignature(manifest._files)` 写入 `manifest._signature`。
   - 这说明 `.tpex` 的 integrity 元数据不是 Nexus 临时推导，而是在 CLI build / builder 产物里生成。
4. `apps/nexus/server/utils/tpex.ts`
   - `extractTpexMetadata()` 解析 tar 包里的 `manifest.json`、README、icon，并返回 `integrity: verifyManifestIntegrity(manifest, files)`。
   - `verifyManifestIntegrity()` 要求 `manifest._files` 是 hash map、`manifest._signature` 非空；它会排除 `manifest.json` / `key.talex` 后重新计算包内文件 SHA-256，并比对文件集合、hash 和签名。
   - 失败 reason 包含 `manifest._files is missing or invalid.`、`manifest._files does not match package contents.`、`manifest._files hash mismatch for ...`、`manifest._signature does not match manifest._files.` 等具体原因。
5. `apps/nexus/server/api/dashboard/plugins/package/preview.post.ts`
   - preview API 会调用 `extractTpexMetadata(buffer)`，但响应只返回 `manifest`、`readmeMarkdown`、`iconDataUrl`、`hasIcon`。
   - 当前没有把 `metadata.integrity` 返回给前端 preview，因此“预览阶段可见 trust / risk summary”仍未闭环。
6. `apps/nexus/server/utils/pluginsStore.ts`
   - `publishPluginVersion()` 和 rejected version re-edit 路径都会重新读取 package buffer，计算包 SHA-256 signature，并调用 `extractTpexMetadata()`。
   - 若 `metadata.integrity.valid` 为 false，会直接抛出 `Plugin package integrity verification failed: ...`，不会写入 pending version。
   - 发布成功后版本记录保存 `signature`、`packageUrl`、`packageSize`、`manifest`、`readmeMarkdown`，初始 status 为 `pending`。
7. `packages/tuff-cli-core/src/publish.ts`
   - `publish()` 扫描 `dist/build` / `dist` 下最新 `.tpex`，计算并展示 package `Sha256`；`--dry-run` 只输出摘要，不上传。
   - 真实 publish 前会做 publisher auth preflight，再把 `.tpex` 作为 form package 上传到 Nexus versions API。
8. `apps/core-app/src/main/modules/plugin/install-queue.ts`
   - 安装队列在 provider 准备完成后进入 `verifying` 阶段；若 provider metadata 中有签名，会调用 `verifyPackageSignature(filePath, signature, packageSize)`。
   - 当期望 signature 存在且校验失败时，安装会抛出 `Package verification failed: ...`。
9. `apps/core-app/src/main/modules/plugin/plugin-resolver.ts` 与 `apps/core-app/src/main/modules/plugin/plugin-runtime-integrity.ts`
   - resolver 安装 `.tpex` 时要求 manifest 存在 `_files` / `_signature`，并在解压后通过 `ensurePluginRuntimeIntegrity()` 修复或阻断缺失的本地 webcontent 入口文件。
   - 这条 runtime integrity 更偏“安装后资源完整性 / UI 入口文件存在性”，不是完整复算 `_files` hash 的包级安全扫描。

## 结论

主文档的边界判断成立：Tuff 已经有真实 `.tpex` package integrity gate，但它仍不是完整 Store 安全审核体系。

当前已经成立的链路：

1. **打包阶段有元数据**：CLI build / builder 会把构建产物写成 `_files` SHA-256 map 和 `_signature`。
2. **Nexus 提交阶段会硬阻断坏包**：`publishPluginVersion()` / re-edit 都会调用 `extractTpexMetadata()`，并在 integrity 失败时拒绝提交，不会把坏包伪装成 pending。
3. **安装阶段有包 SHA-256 校验**：从 registry 安装时，provider metadata 带 `signature` / `packageSize` 后，CoreApp install queue 会先校验包文件再进入确认和安装。
4. **运行时仍有资源完整性守卫**：resolver / loader 会检查 webcontent 入口文件，能从 sibling archive 修复缺失文件，修复不了就阻断加载或安装。

仍不能被夸大的部分：

1. **preview UI 不等于 trust summary**：`package/preview.post.ts` 虽然计算了 `metadata.integrity`，但没有把结果返回给前端；因此安装前预览还不能展示 integrity valid / invalid reason、risk badge 或 package policy 摘要。
2. **完整性不等于恶意代码审计**：`_files` / `_signature` 只能证明包内容与 manifest 记录一致；它不能判断插件逻辑是否恶意、依赖是否危险、权限理由是否合理。
3. **本地 `.tpex` 直接安装的校验层级更低**：本地文件 provider 能 peek manifest，resolver 要求 `_files` / `_signature` 存在，并检查 webcontent 文件完整；但没有像 Nexus `verifyManifestIntegrity()` 那样在 CoreApp 本地安装路径复算全部 `_files` hash。这个事实支持主文档中“Store / package policy baseline 仍需补”的 P0 切片。
4. **risk summary 还未产品化**：size、forbidden files、raw secret patterns、high-risk permission summary、dependency manifest 摘要仍应作为后续 package policy baseline，而不是把现有 hash 校验包装成完整安全扫描。

因此，主文档把 `.tpex` 写成“已有完整性校验和 package preview 底座，但 Store trust summary / package policy / security scan / 安装 evidence 仍需产品化”是准确的。后续最小改进不应重做打包格式，而应优先把 preview 阶段已经算出的 integrity、发布阶段的 failure reason、权限 / sdkapi / 高风险 capability 摘要合并成用户可见的 package risk summary。

## 是否发现需修正的主文档问题

否。未发现需要修改 `01-11` 主分析文档的问题。

主文档没有把 `.tpex` 完整性校验误写成完整安全审核，也没有否认当前已有 package integrity gate。更精确的补充方向是后续实现任务：让 package preview API / UI 暴露 `integrity.valid`、`integrity.reason`、package SHA-256、sdkapi、权限风险和 package policy baseline，而不是修改现有分析结论。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-66.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout。
