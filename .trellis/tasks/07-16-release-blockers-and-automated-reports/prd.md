# 修复发布阻断与自动报告

## Goal

让下一次 Tuff 官方发布在 GitHub、Nexus 与 CoreApp 更新链路中具备一致、可验证的资产清单、SHA-256、detached signature、签名公钥与 macOS 原生签名证据；同时自动生成中英文 release notes 和机器可读/人类可读的发布测试 summary。

## Background

- `v2.4.13-beta.14` 的 GitHub 与 Nexus 下载链路、三平台首选资产和 SHA-256 已实测可用，但远程门禁仍失败：manifest 将 Linux AppImage/deb 同时映射到 `linux/x64`，且现有 workflow 资产名不被 validator 接受。
- 该版本所有下载资产都没有 `.sig`/`.asc` sidecar，Nexus `signatureUrl` 为空，`/api/releases/signing-key` 返回 `publicKey: null`；CoreApp 内置公钥与 Nexus 仓库公钥一致，但 Nexus 运行时只读取未配置的 binding/env。
- macOS arm64 包当前只有 ad-hoc 签名，`TeamIdentifier` 缺失；workflow 与 `electron-builder.yml` 明确禁用了 Developer ID 签名、hardened runtime 与 notarization，自定义 postprocess 还会再次 ad-hoc 签名覆盖已有签名。
- `scripts/generate-release-notes.mjs` 已支持同渠道 tag 区间、手工双语覆盖和 GitHub release body；workflow 已调用它，但没有将发布完整性验证结果固化为独立 summary。

## Requirements

### R1 — 唯一首选资产矩阵

- 发布 manifest 对每个 `platform/arch` 只能保留一个首选 CoreApp 资产；Windows 优先 setup.exe，macOS 优先 dmg、其次 app zip，Linux 优先 AppImage、其次 deb/snap。
- manifest 必须包含实际 workflow 产物名、SHA-256 与 detached signature sidecar 名，并通过 `scripts/update-validate-release-manifest.mjs`。
- 非首选但仍随 GitHub Release 发布的安装包也必须生成 detached signature；sidecar 不得作为可下载 core artifact 写入 manifest 或 Nexus 平台矩阵。

### R2 — 可执行的 detached signature 链

- create-release job 必须从 GitHub Actions secret 读取 release signing private key，校验其公钥与仓库固定公钥一致，随后签名发布资产。
- 缺少私钥、私钥不匹配、公钥解析失败、任一资产缺少/无法验证 sidecar 时必须阻止发布，禁止静默降级为 unsigned release。
- Nexus GitHub 资产链接必须携带 manifest 对应的 `signatureUrl`，并跳过 sidecar 自身；CoreApp 可通过 Nexus 元数据下载并用固定公钥验证资产。
- Nexus signing-key endpoint 在 binding/env 未配置时必须返回仓库固定公钥；binding/env 仍可显式覆盖以支持安全轮换。

### R3 — macOS 原生签名显式豁免与可选门禁

- 在用户明确告知 Apple Developer 已配置之前，官方 workflow 默认使用 `waived` 模式：允许 ad-hoc macOS 包继续发布，但 evidence 与 summary 必须明确标记 `apple-developer-not-configured`，不得伪装为 Developer ID/Gatekeeper pass。
- `waived` 只豁免 Apple Developer 原生可信链；跨平台 detached signature、SHA-256、manifest 与 Nexus `signatureUrl` 仍是强制门禁。
- 只有完整提供 `CSC_LINK` / `CSC_KEY_PASSWORD` 与一组 Apple notarization 凭据时才进入 `developer-id` 模式，并启用 `forceCodeSigning`、hardened runtime、notarization 与严格验证。
- Apple 凭据部分配置属于错误，必须 fail closed，不能自动回退到 `waived`。
- 自定义 macOS postprocess 在 `developer-id` 模式不得修改或覆盖 electron-builder 签名；`waived` 模式保留现有 ad-hoc 兼容后处理。
- 上传前始终生成不含 secret 的 JSON evidence：`developer-id` 要求 codesign/TeamIdentifier/Gatekeeper/notarization 全通过；`waived` 记录实际检查结果和豁免原因但不阻止发布。

### R4 — 自动双语 release notes

- 每次发布继续由 `scripts/generate-release-notes.mjs` 自动生成 `update_<version>.zh.md`、`update_<version>.en.md`、GitHub release body 与 PR 清单。
- 本次 `v2.4.13-beta.14` 必须生成一套可审阅的中英文 release notes；内容不得把未通过的签名/Gatekeeper 项描述为已通过。

### R5 — 自动发布测试 summary

- create-release job 必须在创建 GitHub Release 前生成 JSON 与 Markdown 两种 summary。
- summary 至少记录 tag/version/channel、首选资产矩阵、文件大小、SHA-256、detached signature 验证、macOS native-signing mode/evidence 与总状态。
- summary 生成器必须重新计算 digest 并验证 sidecar；完整性失败必须以非零状态阻止发布。Apple native trust 仅在 `developer-id` 模式是硬失败，在 `waived` 模式必须作为显式风险豁免记录。
- Markdown summary 必须写入 GitHub Actions step summary，JSON/Markdown 文件必须作为 release assets 上传，便于后续 Nexus/人工审计。

### R6 — 签名密钥轮换与官方应用身份

- 生成并启用新的 RSA-4096 release signing key；私钥只能保存在 GitHub Actions secret，CoreApp 与 Nexus 固定公钥必须同步轮换且可按指纹审计。
- 每个 CI CoreApp 包必须在 `afterPack` 生成签名构建证明，绑定应用/版本/渠道/平台/架构/commit 与物理 `app.asar` SHA-256；缺失或错配私钥必须阻止打包。
- CoreApp 必须完全离线验证证明、固定公钥和物理 `app.asar`，只在全部通过时认定官方版本；篡改或身份错配必须上报 verification failure，本地未签名包不得误报为官方。
- Release 创建前必须验证 CoreApp、Nexus 两份 PEM、Nexus server PEM 与 Cloudflare fallback 模块的 SPKI 指纹完全一致；任何旧 key 或漂移必须 fail closed。

## Constraints

- 私钥、证书与 Apple 凭据只来自 GitHub Actions secrets，不能写入仓库、日志、release assets、Trellis evidence 或 summary。
- 固定公钥不是 secret；CoreApp 与 Nexus 必须使用同一把公钥。
- 保留现有 workflow 资产命名与用户下载兼容性；通过 validator/manifest 适配真实命名，不为修复重复矩阵而复制大体积二进制。
- 不追溯替换 `v2.4.13-beta.14` 已发布的 macOS 二进制。Apple Developer 原生签名按用户决策长期处于 `waived`，直到用户明确说明证书与 notarization 已配置；该豁免不得放宽 detached signature 门禁。

## Acceptance Criteria

- [x] 给定三平台资产和一把临时 RSA key，发布资产准备器生成唯一 `win32/x64`、`darwin/arm64`、`linux/x64` manifest 条目；全部可发布安装包均有可验证 `.sig`。
- [x] 生成的 manifest 通过 `scripts/update-validate-release-manifest.mjs`，并拒绝重复 `platform/arch` 或缺失 signature。
- [x] 发布测试 summary 生成器重新验证 SHA-256 与 signature，产出状态为 pass 的 JSON/Markdown；篡改文件或 sidecar 时返回非零状态并固化 fail summary。
- [x] Nexus signing-key endpoint 在无 binding/env 时仍返回与 CoreApp `resources/keys/release-signing-public.pem` 等价的 PEM。
- [x] workflow 只按 manifest 首选项链接 Nexus 资产，payload 同时包含 `sha256` 与 GitHub sidecar `signatureUrl`。
- [x] 无 Apple 凭据时 workflow 选择 `waived` 并成功生成风险标记 evidence/summary；完整凭据选择 `developer-id` 严格门禁；部分凭据 fail closed。
- [x] `v2.4.13-beta.14` 中英文 release notes 已生成，明确说明已验证项与未闭环限制。
- [x] 相关脚本语法检查、manifest/summary smoke scenario、Nexus/CoreApp 定向类型检查与现有测试均通过。
- [x] 新 RSA-4096 私钥已写入 GitHub Actions `RELEASE_SIGNING_PRIVATE_KEY`；CoreApp/Nexus 公钥与打包内公钥指纹一致，私钥未写入仓库、日志或文档。
- [x] macOS arm64 隔离包已验证 unsigned 路径；编译验证器用隔离 pinned key 验证 official proof 为 pass，并覆盖身份/`app.asar`/私钥错配；最终运行包替换外部公钥并重签仍以 `signature-invalid` 拒绝。
- [x] 清除 Nexus server PEM 与 worker fallback 中的旧公钥；一致性脚本正向返回新指纹、负向拒绝漂移，Nexus production build 与本地 Wrangler `/api/releases/signing-key` smoke 均返回新指纹。

## Out of Scope

- 生成或保管真实 Developer ID 证书、Apple notarization credential。
- 在本任务中重新发布或就地替换 `v2.4.13-beta.14` 的 macOS 二进制。
- Windows Authenticode 与 Linux 包仓库级签名；本任务强制跨平台 detached signature，Apple Developer 原生可信链在用户明确配置前按风险豁免处理。
