# 建立插件签名信任链

## Goal

建立从发布者签名、Nexus admission attestation 到 CoreApp 验证的非对称插件信任链，明确区分内容完整性、发布者身份、平台审核和本地开发信任，并支持 key rotation/revocation。

## Confirmed Facts

- CLI 当前 `_signature` 是排序 `_files` 后的 MD5/base64，属于内容清单校验，不证明持钥者身份。
- Builder 会生成并打包随机 `key.talex`，CoreApp resolver 的 key fallback 不能形成可信签名链。
- Nexus version `signature` 当前是整个 package 的 SHA-256；CoreApp 下载校验该摘要，只证明传输 bytes 与 registry metadata 一致。

## Requirements

1. 保留 SHA-256 作为 content digest；新增 versioned canonical signing payload，至少绑定 policy version、plugin id/name/version、channel、artifact SHA-256、Manifest file-map digest 和签发时间/有效期。
2. 使用 Node/CoreApp/Nexus 均可验证的非对称算法和稳定编码；签名对象包含 algorithm、key id、payload digest 和 signature，不依赖 JSON 属性顺序。
3. 发布者私钥只从受控 secret/keychain/HSM 接口读取，不写入 `.tpex`、`key.talex`、仓库、日志或 evidence。公开 key/certificate 由 Nexus publisher identity 管理。
4. Nexus 在 package policy/scan 通过后验证 publisher signature，并在审核通过时签发 admission attestation；两层状态分别持久化和审计。
5. CoreApp 官方来源安装必须验证 artifact digest、publisher signature、Nexus attestation、plugin identity/version/channel 和 trust root；任一失败均在解包/启用前 fail closed。
6. 支持 key rotation、overlap window、revocation 和历史版本重验；撤销后 Nexus 展示门禁立即失效，CoreApp 对新安装拒绝，已安装策略需有明确状态。
7. 本地开发包只能通过显式 dev trust 流程安装，不能伪装成 Nexus trusted/official。

## Acceptance Criteria

- [x] 合法 publisher signature + Nexus attestation 在 CLI/Nexus/CoreApp 三端验证同一 canonical payload 成功。
- [x] package byte、Manifest identity/version/channel、file-map digest 或签名任一篡改均产生稳定失败 code，且不进入安装/公开展示。
- [x] 私钥材料不会出现在 `.tpex` inventory、git tracked files、日志、错误响应或 evidence；旧 `key.talex` 不再承担信任语义。
- [x] 未知 key、过期 key、撤销 key、错误 issuer/audience 和降级算法全部 fail closed。
- [x] rotation overlap 允许新旧有效 key 验证；overlap 结束后旧 key 按策略拒绝，历史审计仍可解释。
- [x] registry SHA-256、publisher signature、Nexus attestation 在类型和 UI/诊断中使用不同字段，不再统称 signature。
- [x] focused crypto vectors、Nexus admission、CoreApp install、lint/typecheck 与 packaged install smoke 通过。

## Out of Scope

- CoreApp 可执行文件/OTA code signing。
- 自动信任任意自签名第三方证书。
- 把 security scan 或人工审核替换为签名验证。

