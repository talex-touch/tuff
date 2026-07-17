# 实施计划：发布阻断与自动报告

## 实施顺序

1. **资产与 manifest**
   - 新增发布资产准备器，统一分类、pair 优选、digest、私钥/公钥匹配、签名和回验。
   - 收紧 manifest validator：要求 core signature、pair 唯一，并兼容当前 workflow 真实文件名。
   - 将 create-release workflow 的 inline manifest 生成替换为准备器调用。

2. **Nexus 签名链**
   - 为 signing-key endpoint 增加固定公钥 fallback。
   - 将 Nexus sync 改为 manifest 驱动，主文件和 sidecar 必须同时存在，并传 `signatureUrl`。

3. **macOS 原生签名模式**
   - 新增凭据模式解析器：全部缺失选择 `waived`，完整凭据选择 `developer-id`，部分配置报错。
   - `developer-id` 才强制 code signing / hardened runtime / notarization；`waived` 保留 ad-hoc 兼容构建。
   - 验签 evidence 与 release summary 显式区分 `pass`、`waived`、`fail`，且 Apple 豁免不影响 detached signature 门禁。

4. **自动报告**
   - 新增 release test summary 生成器，独立重算 digest 与验签，整合 macOS evidence。
   - workflow 在创建 Release 前运行 validator/summary，将 Markdown 写入 Actions summary，并上传 JSON/Markdown。
   - 生成 `v2.4.13-beta.14` 中英文 notes，并验证 GitHub body 生成。

5. **签名密钥轮换与官方构建身份**
   - 生成新的 RSA-4096 密钥对，私钥直接写入 GitHub Actions `RELEASE_SIGNING_PRIVATE_KEY` secret，仓库仅更新 CoreApp/Nexus 固定公钥。
   - 在 `afterPack` 最后生成签名的构建证明，绑定版本、渠道、平台、架构、commit、公钥指纹与 `app.asar` SHA-256；CI 强制生成，本地无私钥时保留 unsigned 包路径。
   - 将固定公钥显式打入 `extraResources`，CoreApp 启动时使用嵌入公钥和 Electron `original-fs` 离线验证物理 `app.asar`，统一回传 `isOfficialBuild` / `verificationFailed` / `hasOfficialKey`。
   - 轮换 Nexus server PEM 与 Cloudflare worker fallback，新增四源 SPKI 一致性门禁并接到 `create-release` 的资产收集前。

## 正确性验证

- 用临时目录、三平台伪资产和临时 RSA key 实跑资产准备器；检查三 pair 唯一、全部安装包 sidecar 有效。
- 对生成 manifest 运行 `node scripts/update-validate-release-manifest.mjs --manifest <path>`。
- 实跑 summary 生成器得到 pass；复制并篡改一个资产后确认命令非零退出。
- 对 workflow YAML 做解析检查，并运行 release gate/notes 现有定向测试。
- 对 Nexus signing-key/asset metadata 相关定向测试或类型检查。
- 验证 resolver 的全空、两种完整凭据和部分配置矩阵；无证书 bundle 在 `waived` 产生豁免证据，在 `developer-id` 非零失败；summary 接受合法豁免并拒绝错误 reason。
- 用隔离 RSA key 实跑构建证明生成/验证，覆盖正确签名、身份错配、`app.asar` 篡改、证明篡改、缺失证明、错配/缺失私钥。
- 生成 macOS arm64 可运行包并以隔离 profile 启动：unsigned 包记录 `Unsigned packaged build detected`；同一编译验证器用隔离 pinned key 验证 official proof 为 pass；最终包替换外部公钥并重签后仍以 `signature-invalid` 拒绝，证明运行时使用编译内信任根。
- 校验 CoreApp/Nexus/打包内公钥 SHA-256 均为 `a340b58cff2413f11c64b406fa745e76910759d19a211b72d176686b021fb2ed`，并确认 GitHub secret 更新时间已刷新。
- 运行四源信任根门禁正反场景；Nexus `nuxt build` 成功，并以 Wrangler 本地启动生产 worker，确认 `/api/releases/signing-key` 返回新指纹。

## 风险与回滚点

- **私钥格式/轮换**：准备器只接受可解析 PEM，并对固定公钥指纹；错 key 在创建 Release 前失败。
- **macOS 签名策略**：`TUFF_OFFICIAL_RELEASE_BUILD=true` 只由完整 Apple/CSC 凭据触发；长期默认 `waived` 是 owner 明确接受的风险，不得误报为 native trust pass，也不得豁免 detached signature。
- **Nexus pair 覆盖**：仅遍历 manifest 首选项；若缺 sidecar，整步失败，不退回旧的文件名猜测。
- **现有 updater 文件名**：不重命名主资产；validator 扩展兼容模式，避免 `latest.yml` 路径失配。
