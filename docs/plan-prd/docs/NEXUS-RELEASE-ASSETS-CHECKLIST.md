# Nexus Release Assets 核对清单（可执行）

> 用途：作为 `v2.4.7` Gate D 的执行清单，确保 release notes、assets、signature、manifest 可被 Nexus API 正确消费。
> 适用范围：`/api/releases/*`（Nexus 发布链路）。

## 0. 输入参数

- `TAG`：例如 `v2.4.7`
- `BASE_URL`：例如 `https://tuff.tagzxia.com`
- `CHANNEL`：`RELEASE | BETA | SNAPSHOT`
- `TARGET_MATRIX`：本次发布目标平台/架构矩阵（例如 `win32/x64`、`darwin/arm64`、`linux/x64`）

## 0.1 责任位置与完成判定矩阵

| 检查域 | 责任位置 | 执行角色 | 完成判定 |
| --- | --- | --- | --- |
| Release 元数据 | `GET /api/releases/{tag}?assets=true` | Release Owner | `tag/version/channel/status/notes` 符合第 1 节全部约束 |
| Assets 矩阵 | `GET /api/releases/{tag}/assets` | Release Owner + Build Owner | `TARGET_MATRIX` 每个 `platform/arch` 至少 1 个有效资产，且无重复冲突 |
| Signature | `GET /api/releases/{tag}/signature/{platform}/{arch}` | Security Owner | 签名可获取（200）且与资产一一对应 |
| Manifest | `scripts/update-validate-release-manifest.mjs` + `tuff-release-manifest.json` | Build Owner | 脚本校验通过，manifest 字段与发布信息一致 |
| 下载链路 | `GET /api/releases/latest` + `GET /api/releases/{tag}/download/{platform}/{arch}` | Release Owner | latest 命中当前发布，download 返回可下载结果（直链或 302） |
| 发布前门禁 | `docs/plan-prd/TODO.md`（Gate C~E） | Tech Lead | Gate C 通过且本清单第 1~5 节全部打勾，才可进入 Gate E |

## 1. Release 元数据核对

- [ ] `tag/name/version/channel` 一致，且 `version` 为合法 semver。
- [ ] `notes` 为 `{ zh, en }`，两种语言均非空。
- [ ] `notesHtml` 若启用，同样为 `{ zh, en }`。
- [ ] `status` 初始为 `draft`，发布后变更为 `published`。

建议 API 校验：

```bash
curl -s "${BASE_URL}/api/releases/${TAG}?assets=true" | jq '.release | {tag,version,channel,status,notes,notesHtml}'
```

## 2. Assets 矩阵核对

- [ ] 每个目标 `platform/arch` 至少有 1 个可下载资产。
- [ ] 资产文件名、size、sha256、contentType 已落库。
- [ ] 无重复冲突：同一 `platform/arch` 最终只保留当前版本资产。

建议 API 校验：

```bash
curl -s "${BASE_URL}/api/releases/${TAG}/assets" | jq '.assets[] | {platform,arch,filename,size,sha256,downloadUrl,signatureUrl}'
```

## 3. Signature 核对

- [ ] 目标 `platform/arch` 均可获取 `signatureUrl`（若本次发布要求签名）。
- [ ] `GET /api/releases/{tag}/signature/{platform}/{arch}` 返回 200。
- [ ] 签名文件与资产一一对应（文件名后缀 `.sig`）。

建议 API 校验（示例）：

```bash
curl -I "${BASE_URL}/api/releases/${TAG}/signature/win32/x64"
curl -I "${BASE_URL}/api/releases/${TAG}/signature/darwin/arm64"
```

## 4. Manifest 核对

- [ ] Release 资产包含 `tuff-release-manifest.json`。
- [ ] manifest 中 `release.version/channel/tag` 与当前发布一致。
- [ ] `artifacts[*].sha256`、`coreRange`（renderer/extensions）齐全。
- [ ] 通过仓库脚本校验：

```bash
node scripts/update-validate-release-manifest.mjs --manifest "/path/to/tuff-release-manifest.json"
```

参考规范：

- `docs/plan-prd/03-features/download-update/github-release-asset-spec.md`

## 5. 下载链路核对

- [ ] `GET /api/releases/latest?channel=${CHANNEL}` 可返回当前发布。
- [ ] `GET /api/releases/{tag}/download/{platform}/{arch}` 可下载或 302 到外链。
- [ ] 若环境要求签名 URL，未签名请求返回 403；签名 URL 可下载。

建议 API 校验（示例）：

```bash
curl -s "${BASE_URL}/api/releases/latest?channel=${CHANNEL}" | jq '.release.tag,.release.channel'
curl -I "${BASE_URL}/api/releases/${TAG}/download/win32/x64"
```

## 6. 发布动作前置（Gate E 前）

- [ ] Gate C 已通过（lint/typecheck）。
- [ ] 风险门禁满足：`P0=0`。
- [ ] 本清单 1~5 全部打勾。
- [ ] 再执行 tag 发布动作与 GitHub/Nexus 同步验证。

---

## 快速结论模板（执行后回填）

- Tag：`<TAG>`
- Channel：`<CHANNEL>`
- Assets 覆盖：`<matrix>`
- Signature：`通过/不通过`
- Manifest：`通过/不通过`
- 下载链路：`通过/不通过`
- 结论：`可发布 / 阻塞（附原因）`
