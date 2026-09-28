# R5 / AC7 — 三平台真伪横幅不会误报正版（离线实物校验）

2026-09-27，对已发布的 `v2.4.14-beta.47` 官方资产，用应用自带的
`apps/core-app/src/main/modules/build-verification/attestation.ts#verifyBuildAttestation`
+ 仓库内置公钥 `apps/core-app/resources/keys/release-signing-public.pem`，按运行时同样的
`expected: { appId: 'com.tagzxia.app.tuff', version: '2.4.14-beta.47', platform, arch: 'x64' }` 校验，
再按 `build-verification/index.ts` 的规则（`isOfficialBuild = valid`、
`verificationFailed = reason !== 'attestation-not-available' && !valid`）投影成 design §5 的真伪结果。

| 资产 | 解包方式 | valid | reason | 投影 |
|---|---|---|---|---|
| `windows-2022-beta-tuff-2.4.14-beta.47-setup.exe`（NSIS） | `7z x` → `$PLUGINSDIR/app-64.7z` → `resources/` | true | — | **official** |
| `ubuntu-latest-beta-tuff-2.4.14-beta.47.AppImage` | `7z x`（SquashFS）→ `resources/` | true | — | **official** |
| 反向对照：Windows 证明 + 换一个文件当 asar | — | false | `artifact-digest-mismatch` | unofficial |
| 反向对照：Windows 资源按 `platform: linux` 校验 | — | false | `identity-mismatch` | unofficial |

两份证明都是 `channel: BETA`、`commit: 7b86dbdab…`、`keyFingerprint: a340b58c…`。

结论：Windows x64 与 Linux x64 官方包在运行时会被判为官方，三平台横幅不会对正版用户误报；反向对照证明校验有区分力。

残余风险：这是离线实物校验，没有在真实安装上跑 `process.resourcesPath` 的路径解析（NSIS 安装目录 / AppImage 挂载点）。这是 Electron 标准行为，风险低，但严格说未在真机上验证。

脚本：`/tmp/tuff-attest-verify/verify.mts`（`node verify.mts <resourcesDir> <platform> <arch> <version> [asarOverride]`）。
