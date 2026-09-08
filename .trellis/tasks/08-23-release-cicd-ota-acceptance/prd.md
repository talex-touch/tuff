# CI/CD 发布与 OTA 真实验收

## Goal

补齐必需检查、发布依赖、三平台产物与 OTA N/N+1 真机证据。

## Confirmed Facts

- 当前真实版本为 `2.4.14-beta.32`；该 tag 的 Windows、macOS arm64/x64 与 Linux 发布产物、签名、公证、同 SHA `release-quality` 和生产 Gate E 基线均已通过。
- `ci.yml` 对 pull request 与 master push 无路径过滤；GitHub `master` 的经典 branch protection 已启用 7 个稳定 required checks，最近 5 个 PR SHA 与最近 6 个 master SHA 均完整产生这些 context。`enforce_admins=true`、conversation resolution 已启用、`strict=false`；唯一 ruleset 仍处于 disabled。脱敏证据见 `evidence/github-remote-baseline.md`。
- `build-and-release.yml` 已增加同一 SHA 的 `release-quality` 硬依赖；workflow 合同与负向变异证明 build/create/sync 不能绕过失败 gate。
- 当前工作区包含跨 CoreApp、Nexus、Utils 和三个插件的未提交批次，远端全绿不能证明这批代码可发布。
- OTA 状态机、签名校验、持久 lifecycle、helper/recovery 和三平台 adapter 已实现；beta.13 -> beta.14 真机已证明下载、校验和原位替换，但因 helper 泄漏 `ELECTRON_RUN_AS_NODE` 导致目标未启动、health ack 超时，官方 macOS N/N+1 仍未通过。修复已通过聚焦测试、类型检查和负向变异，必须等待两个包含修复的后续官方版本复验。脱敏证据见 `evidence/macos-ota-beta13-beta14.md`。
- 当前批次 `quality:pr`、Utils build、Core node/web typecheck、Nexus/插件聚焦测试、三插件 typecheck/build 与 manifest validation 已通过；独占本仓构建时，`quality:release` 的 lint、全 workspace typecheck、targeted tests、Electron Builder preflight 与 CoreApp production build 也已单命令完整通过。脱敏摘要见 `evidence/local-release-preflight.md`。
- `quality:release` 首次 CoreApp renderer build 曾在 TuffEx `dist` 被并发重建时短暂无法解析 `@talex-touch/tuffex/scroll/style.css`；页面导入、package exports 与生成样式均有效，独占复跑 CoreApp build 和完整门禁后通过，因此该现场不计为源码缺陷，但本地并行会话不得并发重建共享 `dist`。
- 当前 beta.14 的 GitHub/manifest/签名/宿主 macOS 完整性和原生信任证据通过，但生产 Nexus API 仍投影 GitHub fallback 下载地址，未生成同源签名下载参数；严格 Gate E 仍为 `fail`。脱敏摘要见 `evidence/release-matrix-beta14.md`。
- 本地 Nexus 下载 resolver 已修复 `allowUnsignedFallback=false` 时 `missing-secret` 错误放行：GET/HEAD 现在均 fail-closed 返回 `403`，聚焦回归 `14/14`、Nexus typecheck 与 scoped ESLint 通过。该改动尚未部署，不改变 beta.14 生产 Gate E 的失败结论。
- beta.14 的远端 release workflow 已在 GitHub-hosted `windows-2022`、`ubuntu-24.04`、`macos-26` runner 完成三平台构建与 packaged-launch smoke；release summary 同时明确 downgrade/OTA 证据仍为 `static-only`，因此该运行不能关闭 AC6/AC7。当前本地新增的 `release-quality` 尚未进入远端 workflow，最近发布运行也没有该 job。
- Linux packaged updater 的两个源码缺陷已在本地修复：apply helper 进入 `extraResources`，hosted runner 的官方 no-FUSE 环境会跨 helper 继承到更新后重启；脚本不再从 `APPDIR` 猜测模式，AppImage/deb 失败日志也不泄漏完整路径。受控脚本、adapter、handoff 与 workflow tests 全绿，负向变异可拦截配置回退；但尚无包含修复的官方 Linux N -> N+1 runtime 证据，详见 `evidence/linux-packaged-updater-controlled.md`。
- Beta24 -> Beta25 的新鲜隔离尝试在下载达到约 53% 后因 Nexus signed URL 短时过期返回 HTTP 403 而失败，未进入安装；PR #1873 保留 `fallbackDownloadUrl` 并仅在 403 时恢复同一分块，需随新官方版本复验。证据见 `evidence/macos-ota-beta24-beta25-signed-url-expiry.md`。
- Beta29 -> Beta30 的新鲜隔离 macOS arm64 OTA 已完成 signed URL 403 fallback、SHA-256 校验、DMG 原位替换、无提权 handoff、Beta30 官方 attestation 和 startup health；但目标进程仍从 workspace 根 package metadata 解析为 Beta29，启动时进入 recovery-required 且未写入 healthy ack，另暴露 release notes catalog 版本不一致。根因是主进程 `polyfills.ts`/`version-util.ts` 读取根 `package.json`，而 Builder 打包的 CoreApp metadata 已是 Beta30；已切换为 `apps/core-app/package.json`，需包含该修复的新官方版本重新执行 AC6。
- Beta32 的 GitHub release、Nexus latest、manifest v2、四个首选平台资产、签名下载路由与回退路由已收敛；严格生产 Gate E `18/18` 通过，macOS arm64 OTA 下载包 SHA-256 和 detached RSA 签名与 manifest 一致，详见 `evidence/release-matrix-beta32.md`。
- 官方 macOS arm64 Beta31 -> Beta32 已从隔离 profile 完成发现、下载、校验、Settings UI `Restart to Update`、无提权 helper、DMG 原位替换、Beta32 官方 attestation、startup health 和 attempt-bound `healthy` ack；SQLite 终态 revision 8 / `healthy`，详见 `evidence/macos-ota-beta31-beta32.md`。
- 同一隔离源进程在安装前的 clipboard `vision.ocr` 成功返回后 abort；minidump 指向 `tuff_native_ocr.node` 的 N-API AsyncWorker 完成路径。根因是父进程在 terminal message 到达时立即 `worker.terminate()`，可能在 native completion callback 尚未退栈时销毁环境；本地已改为 terminal message 后自然退出，聚焦测试 `18/18`、负向变异和 200 个真实 Electron native worker 自然退出 smoke 通过。Beta32 仍含旧实现，修复必须随下一官方版本发布后再解除推广风险。

## Requirements

- R1：先建立当前未提交批次的可信质量基线；临时 `.dsh-plugin-hub-*` 产物不得污染 lint、测试或交付范围。
- R2：release workflow 必须在构建/发布前执行同一 commit SHA 的不可绕过质量门禁；复用产物、手动触发和 tag 触发均不得跳过。
- R3：master required checks 使用无路径过滤、确定性且实际执行的 job；缺工具导致的 actionlint/测试 skip 不得计为通过。
- R4：各 package CI/publish workflow 的 paths、workspace filter、build、typecheck、test、版本与 dist-tag 必须和包真实依赖图一致。
- R5：三平台 release 产物、架构、签名侧车、manifest v2、rollback target、release notes、Nexus projection 和 updater metadata 必须绑定同一 SHA/version/tag。
- R6：macOS 使用已发布官方签名 N 与 N+1 包，从隔离 profile 完成 ready -> click -> quit -> helper -> replacement -> new process -> health ack，全程无 sudo/AppleScript/密码提示。
- R7：Windows 与 Linux 在真实 runner/宿主验证 N/N-1 发现、下载、完整性、handoff 与 startup health；macOS 不能把静态证据冒充其运行时通过。
- R8：失败必须保留稳定分类与恢复入口；下载完成、installer spawn 或 workflow completed 均不得被误报为 update healthy/release passed。
- R9：证据只保留脱敏摘要，不记录签名 URL 查询、Token、Cookie、私钥、完整日志、下载包或真实用户 profile。

## Acceptance Criteria

- [x] 当前批次 `quality:pr` 等价门禁、Utils build、Core node/web typecheck、Nexus/插件聚焦测试和 manifest validation 全绿，无未处理异常。
- [x] release 构建明确 `needs` 同 SHA quality gate，且负向测试证明 gate 失败时 build/create-release 不可运行。
- [x] master required checks 已启用并指向无路径过滤的确定性 job；远端状态有可核对证据。
- [x] 每个 package CI/publish workflow 与包脚本/依赖一致，关键 package 的 build/typecheck/test 不再软跳过。
- [x] 当前发布 tag 的 GitHub/Nexus/latest/manifest/rollback/签名/架构矩阵一致，真实 host 下载 SHA-256 与 manifest/GitHub 一致。
- [x] 官方 macOS N/N+1 一键静默替换和 health ack 真机通过，记录 bounded timestamps 与失败恢复状态。
- [ ] Windows/Linux 真实平台 workflow 或宿主 smoke 通过；不能执行的项明确 blocked/static-only，不伪造完成。
- [ ] actionlint、release acceptance tests、构建前置检查、release summary 和文档同步全部通过。

## Current Acceptance Matrix

| AC | Status | Evidence / Remaining Gate |
| --- | --- | --- |
| AC1 | pass | 当前批次质量门禁、Utils、Core、Nexus 与三插件本机构建/测试全绿。 |
| AC2 | pass | 同 SHA release gate 已形成硬依赖，合同测试与负向变异通过。 |
| AC3 | pass | `master` 已启用 7 个 GitHub Actions required checks；最近 5 个 PR SHA 与最近 6 个 master SHA 均完整产生，失败提交也真实呈现失败或取消。`strict=false` 作为非阻塞限制保留。 |
| AC4 | pass | tuff-cli CI/publish 假绿已修复，workflow contracts `33/33` 与 CLI tests `6/6` 通过。 |
| AC5 | pass | Beta32 GitHub/Nexus/latest/manifest/rollback/签名/架构矩阵一致；严格生产 Gate E `18/18`，真实 macOS arm64 下载 SHA-256 与 detached 签名通过。 |
| AC6 | pass | 官方 Beta31 -> Beta32 完成 ready、Settings UI install、无提权 handoff、原位替换、Beta32 startup health 与 attempt-bound `healthy` ack。 |
| AC7 | blocked | Linux helper 打包、替换/恢复与 no-FUSE 重启源码缺陷已修并通过受控测试；Windows/Linux 尚无官方 N/N+1 的发现、下载、替换、handoff 与 health-ack 真机证据。 |
| AC8 | partial | actionlint、release checks、本地 `quality:release`、Beta32 同 SHA `release-quality`、严格 Gate E 和 macOS N/N+1 已通过；Windows/Linux 真机及最终文档收尾未闭环。 |

## Out of Scope

- 不直接修改生产发布数据库，不绕过 GitHub/Nexus 审核、签名、公证或 branch protection。
- 不为获得绿色结果而删除或提交无法确认归属的 `.dsh-plugin-hub-*` 临时目录。
