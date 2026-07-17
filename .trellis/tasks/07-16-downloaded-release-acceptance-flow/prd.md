# Establish downloaded release acceptance flow

## Goal

以当前已发布版本为真实输入，完成从 GitHub/Nexus 发布元数据、用户下载链路、资产完整性与 macOS 安全检查，到隔离启动和关键打包应用场景的端到端验收；同时将“发版测试”固化为后续会话的统一触发词与标准流程。

## Confirmed Baseline

- 根包与 CoreApp 当前版本均为 `2.4.13-beta.14`，目标 tag 为 `v2.4.13-beta.14`。
- GitHub Release 于 2026-07-16 发布，状态为 prerelease，共 10 个资产。
- 当前主机为 macOS arm64；可执行资产为 `macos-latest-beta-tuff-2.4.13-beta.14-arm64.app.zip`，GitHub digest 为 `420a52b7938917a8a104f7219a22bf0cbd711eae57cc49eccbde8431b3774f0b`。
- Release 同时包含 `tuff-release-manifest.json`、Windows x64 安装包、Linux x64 AppImage/DEB 与 updater metadata；资产列表中没有 `.sig` / `.asc` sidecar。
- 现有 `check-release-gates`、manifest validator、packaged startup benchmark 和 packaged indexing diagnostics probe 可复用，不另起第二套验证逻辑。

## Requirements

1. 目标版本必须从仓库根包和 CoreApp 包解析，并确认二者一致；GitHub tag、Nexus release/latest 与 manifest 必须匹配同一版本和 BETA 渠道。
2. 对 GitHub Release 元数据、manifest、全平台核心资产矩阵，以及 Nexus release/latest/assets/signed-download/signature/signing-key 链路执行只读检查；不得调用生产写接口。
3. 下载当前主机的 macOS arm64 ZIP 和真实 manifest 到隔离目录；不复用工作区 `dist`，不覆盖 `~/Downloads` 或 `/Applications` 中的应用。
4. 使用 manifest validator、GitHub digest 与本地 SHA-256 交叉验证文件名、平台、架构、版本和内容完整性；任何不一致必须作为发版失败项报告。
5. 解压后检查 app bundle 版本、Mach-O 架构、可执行权限、`codesign --verify` 与 `spctl --assess`；签名或 Gatekeeper 失败必须保留原始结论，不得通过移除 quarantine、临时重签或关闭系统安全策略掩盖。
6. 使用隔离 userData/profile 启动下载的打包应用，至少证明进程可启动、CDP/renderer 可用、无启动级崩溃，并复用 packaged startup 与 indexing diagnostics 最近路径执行一个关键 UI/诊断场景。
7. 测试不得登录真实账号、使用生产 API key、修改现有用户配置、触发真实更新安装或替换已安装应用；测试进程和临时 profile 必须在结束后清理。
8. 结果必须区分 `pass`、`fail`、`blocked` 与仅静态覆盖的平台；Windows/Linux 在 macOS 上只验证发布矩阵与下载端点，不宣称运行时通过。
9. 将后续用户口令“发版测试”定义为本流程：远程发布门禁 → 真实主机资产下载 → 完整性/安全检查 → 隔离运行时 smoke → 证据汇总；默认测试仓库当前版本，可由用户显式指定 tag。

## Acceptance Criteria

- [x] 当前版本、GitHub Release 与 Nexus BETA latest 指向同一 tag，完整资产矩阵已记录。
- [x] 真实 manifest 和 macOS arm64 ZIP 下载完成，manifest validator 与 SHA-256 交叉校验已执行并记录。
- [x] app bundle 版本、架构、可执行性、codesign 与 Gatekeeper 结果已记录，失败项未被绕过。
- [x] 下载包在隔离 profile 下完成启动 smoke，并至少完成一个打包 UI/索引诊断场景；原有 profile 和已安装应用未改动。
- [x] Nexus 全平台下载端点、签名端点和 latest 链路完成只读验证；非本机平台不作运行时通过声明。
- [x] 标准“发版测试”流程写入项目规范并从规范索引可发现，后续默认复用现有验证器和探针。
- [x] 临时进程与测试 profile 清理完成，最终报告明确列出通过、失败和阻塞项。

## Out of Scope

- 在 macOS 主机上宣称 Windows/Linux 安装或运行通过。
- 覆盖、升级或卸载 `/Applications` 中的现有 Tuff。
- 登录真实账号、调用生产写接口或执行真实自动更新安装。
- 为本次发现的产品缺陷顺带发布新版本；缺陷进入独立修复任务。
