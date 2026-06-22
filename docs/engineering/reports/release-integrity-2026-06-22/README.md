# Release Integrity Gate E Evidence

> 采样时间：2026-06-22T01:53:32+0800
> 版本：`v2.4.12-beta.8`
> 范围：GitHub Release manifest、Nexus `/latest` / assets / download / signature endpoint、CoreApp update signature verifier。

## 结论

R1 Gate E 仍未闭环。真实链路中 Nexus release metadata、`/api/releases/latest`、assets 与 signed download endpoint 已可访问；GitHub Release 存在 `tuff-release-manifest.json`，但当前 release 没有 artifact `.sig` / `.asc` sidecar，manifest 也没有 core artifact `signature` 字段。Nexus 资产记录没有 `signatureUrl` / `signatureKey`，signature endpoint 对所有 matrix entry 返回 404，`/api/releases/signing-key` 返回 `publicKey: null`。

这说明当前阻塞集中在发布资产签名材料与生产 signing key 配置，不是 CoreApp / Nexus 代码侧 focused matrix 未覆盖。

## 真实链路采样

| 链路 | 状态 | 证据 |
| --- | --- | --- |
| Nexus release metadata | pass | `GET https://tuff.tagzxia.com/api/releases/v2.4.12-beta.8?assets=true` 返回 `tag=v2.4.12-beta.8`、`version=2.4.12-beta.8`、`channel=BETA`、`status=published`。 |
| Nexus latest | pass | `GET https://tuff.tagzxia.com/api/releases/latest?channel=BETA` 返回 latest tag `v2.4.12-beta.8`。 |
| Nexus assets | partial | 返回 3 个 matrix asset：`darwin/x64` zip、`linux/x64` deb、`win32/x64` exe；三者 `sha256` 均为 64 hex，但 `signatureUrl=null`、`signatureKey=null`。 |
| Nexus download endpoint | pass | 三个 asset 的 signed `downloadUrl` 均返回 302，跳转到同 tag 的 GitHub Release artifact。 |
| Nexus signature endpoint | fail | `darwin/x64`、`linux/x64`、`win32/x64` 均返回 404 `Asset signature is not available.` |
| Nexus signing key | fail | `GET /api/releases/signing-key` 返回 `{"publicKey":null,"message":"Release signature key not configured."}`。 |
| GitHub Release metadata | pass with authenticated `gh` | `gh release view v2.4.12-beta.8 --repo talex-touch/tuff` 返回 `isDraft=false`、`isPrerelease=true`、10 个 asset。 |
| GitHub manifest asset | partial | `tuff-release-manifest.json` 存在且可下载；`scripts/update-validate-release-manifest.mjs` 校验失败：core artifacts 缺 `signature`，`linux/x64` 重复，AppImage 命名不符合当前 gate 规则。 |
| GitHub signature sidecars | fail | asset 清单没有 `.sig` / `.asc` sidecar。 |
| CoreApp signature verifier | code-side pass | `pnpm -C "apps/core-app" exec vitest run "src/main/utils/release-signature.test.ts" "src/renderer/src/modules/update/GithubUpdateProvider.test.ts"`：2 files / 4 tests passed。真实下载链路因 Nexus `signatureUrl` 缺失不可执行签名校验。 |
| Nexus signature code matrix | code-side pass | `pnpm -C "apps/nexus" exec vitest run "server/utils/releaseSignature.test.ts" "test/api/releases/signature.get.test.ts" "test/api/releases/assets.post.test.ts"`：3 files / 8 tests passed。 |

## 命令摘要

```bash
node --input-type=module -e 'import { checkRemoteRelease } from "./scripts/check-release-gates/remote-checks.mjs"; /* gate-e remote read-only */'
gh release view "v2.4.12-beta.8" --repo "talex-touch/tuff" --json tagName,isDraft,isPrerelease,assets,url
gh release download "v2.4.12-beta.8" --repo "talex-touch/tuff" --pattern "tuff-release-manifest.json" --dir "/tmp/tuff-release-v2.4.12-beta.8"
node "scripts/update-validate-release-manifest.mjs" --manifest "/tmp/tuff-release-v2.4.12-beta.8/tuff-release-manifest.json"
node "scripts/backfill-release-assets-from-github.mjs" --tag "v2.4.12-beta.8" --base-url "https://tuff.tagzxia.com" --dry-run --timeout-ms "30000"
pnpm -C "apps/core-app" exec vitest run "src/main/utils/release-signature.test.ts" "src/renderer/src/modules/update/GithubUpdateProvider.test.ts"
pnpm -C "apps/nexus" exec vitest run "server/utils/releaseSignature.test.ts" "test/api/releases/signature.get.test.ts" "test/api/releases/assets.post.test.ts"
```

## 机器可读摘要

见 `release-integrity-evidence.json`。

## 缺失项

1. 当前 `check-release-gates.mjs` 的本地 preflight 仍引用已清理的 `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`，本轮按老板指示不纠缠旧 gate，已直接调用 `checkRemoteRelease` 做远程只读采样。
2. GitHub API unauthenticated 请求被 rate limit：`x-ratelimit-remaining: 0`，状态 403；本轮改用已认证 `gh` 复核 GitHub Release。
3. 要关闭 R1 Gate E，需要下一次真实发布上传 artifact `.sig` / `.asc`，在 `tuff-release-manifest.json` 写入每个 core artifact 的 `signature`，并在 Nexus 记录 `signatureUrl` / `signatureKey` 或 GitHub HTTPS signature URL。
4. CoreApp 真实 update signature 校验需要可访问的 `signatureUrl` 与 signing public key；当前生产 endpoint 未配置 key，无法执行真实文件验签。
