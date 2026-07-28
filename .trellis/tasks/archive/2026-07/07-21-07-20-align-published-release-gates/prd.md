# 对齐已发布版本 Release Gate 契约

## Goal

修复 gate-e 对已发布版本 notes、完整 GitHub 资产清单与签名 URL 的误判，并用 v2.4.13-beta.19 真实链路验收。

## Requirements

### R1 — 已发布版本说明以远端为准

- `gate-e` 是已发布版本验收，不得因工作区缺少 `notes/update_<version>*` 再次判失败。
- `gate-e` 必须继续要求 Nexus `notes` 与 `notesHtml` 的中英文内容非空；预发布阶段继续校验本地 notes 输入。

### R2 — Manifest 与完整 GitHub 资产清单职责分离

- Manifest 只声明每个 `platform/arch` 的首选安装包及其 sidecar。
- 同一 Manifest pair 可以发布额外安装格式（例如 Linux AppImage 之外的 DEB），但每个额外安装包必须有唯一、已上传、同 tag 的 `.sig` sidecar。
- 未声明 pair、缺失 sidecar、孤立 sidecar、重复名称、错误 tag/URL 或未完成上传必须继续失败。

### R3 — 校验实际配置的签名 URL

- Nexus 首选资产可使用无 query/hash 的同源 canonical signature endpoint，也可使用与 GitHub Manifest sidecar 资产完全一致的 HTTPS URL。
- Gate 必须请求 Nexus 资产实际返回的 `signatureUrl`，而不是另行拼接一个并未配置的 canonical endpoint。
- HTTP 非 200、空 payload、HTML/JSON payload、URL 与 sidecar 不一致仍是 `gate-e` 失败。

### R4 — 边界

- 不修改已发布 `v2.4.13-beta.19`、不重发版本、不写生产 Nexus 数据。
- 不放宽 preferred matrix、SHA-256、download URL、rollback、GitHub tag/prerelease/latest 等现有门禁。

## Acceptance Criteria

- [x] `v2.4.13-beta.19` 使用正式 `gate-e --strict` 得到 `result: pass` 且进程退出码为 0。
- [x] 远端中英文 notes、三平台 preferred matrix、download URL、SHA-256 与 rollback 门禁仍通过。
- [x] GitHub 直链 sidecar 被真实下载并分类为有效签名 payload；错误或空 payload 仍失败。
- [x] Linux DEB + `.deb.sig` 作为同 pair 的额外已签名格式不再被误判；孤立/缺签名/未声明 pair 仍失败。
- [x] 工作区保持无下载包、签名内容或带 `exp`/`sig` 的验收产物。

## Notes

- 依据 `.trellis/spec/frontend/release-testing.md`：Manifest 是 preferred matrix；GitHub Release 是完整 inventory；linked Nexus asset 使用 matching GitHub sidecar `signatureUrl`。
