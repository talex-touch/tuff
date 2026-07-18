# 落实插件 Package Policy

## Goal

为 `.tpex` 定义一个由共享代码拥有、在 CLI 构建/校验与 Nexus 预览/发布边界一致执行的 fail-closed package policy，消除各层自行解释 Manifest、版本和归档内容的分裂。

## Confirmed Facts

- `packages/tuff-cli-core/src/validate.ts` 只校验 name/version、SDK、category 和权限；`exporter.ts` 另行校验 id、版本同步和默认 10 MB 告警。
- `apps/nexus/server/utils/pluginPackageStorage.ts` 仅硬性限制 `.tpex` 与 30 MB；`tpex.ts` 校验 `_files/_signature` 完整性。
- Nexus preview 当前返回解析结果但不要求完整性通过；publish 在上传前校验完整性，却未统一校验 Manifest 身份与表单版本。
- 仓库内 21 个 runtime plugin Manifest 均有 reverse-domain id、slug name、SemVer、受支持 sdkapi、category 和权限声明；UI-only plugin 可合法缺少 `main`。

## Requirements

1. 在 `packages/utils/plugin` 定义纯函数 policy contract、版本号、限制常量、违规代码和结构化结果；CLI 与 Nexus 不得复制规则。
2. Manifest 规则至少覆盖：root object、reverse-domain `id`、slug `name`、SemVer `version`、受支持 `sdkapi`、按 SDK 要求的 `category`、权限结构、打包态禁用远程 dev source，以及 `_files/_signature` 的 profile 条件。
3. 归档规则至少覆盖：唯一 root `manifest.json`、相对 POSIX 路径、无 traversal/绝对路径/NUL/跨平台大小写冲突、无重复条目、只接受允许的 regular file/directory 类型，以及压缩包/条目数/展开大小上限。
4. 发布期 expected identity 必须与包内 `id/name/version` 和 Nexus 目标插件一致；版本或身份不一致在任何上传/持久化前失败。
5. CLI `validate --strict`、builder 最终 staging、Nexus package preview 与 publish 必须消费同一 policy 结果并输出稳定 code；人类文案不是跨层契约。
6. Policy 不承担恶意代码判定、发布者身份签名、人工审核或公开展示；这些由后续子任务消费 policy 结果。

## Acceptance Criteria

- [x] 共享 policy 对 valid official Manifest/package 返回规范化 identity、limits 与 `policyVersion`。
- [x] 缺 id/name/version/sdkapi/category、非法 SemVer、dev source 未关闭、身份/版本不一致分别返回稳定违规代码。
- [x] traversal、绝对/反斜杠路径、重复/大小写冲突、链接/设备条目、重复 Manifest、过量条目或展开体积超限被拒绝。
- [x] CLI validate/build 与 Nexus preview/publish 对同一 fixture 的 pass/fail 和首要 code 一致。
- [x] Nexus preview 不再把 integrity 或 policy 失败的包当作可发布预览；publish/re-edit 在上传 package object 或写 version row 前执行 admission 断言。
- [x] 现有 canonical official plugins 全部通过 strict Manifest policy；UI-only plugin 不因缺少 `main` 被误拒。
- [x] focused policy、CLI 和 Nexus tests、consumer typecheck/build 与 scoped lint 通过。

## Out of Scope

- 静态恶意代码/secret/dependency 扫描。
- 非对称签名、key rotation/revocation。
- 真实远端上传和 Store 公开展示。
- 删除旧 exporter 或 CLI shim。

