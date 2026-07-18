# 构建测试审计插件源码包

## Goal

从仓库 canonical plugin source 在可复现环境中构建、测试并审计正式 `.tpex`，证明发布物来自已验证源码而不是陈旧 `dist`、手工拼包或未跟踪生成物。

## Confirmed Facts

- `plugins/{plugin}/` 是 canonical source；CoreApp bundled plugin 目录是生成的 release projection。
- CoreApp release 已有 `OFFICIAL_PLUGIN_BUILD_TARGETS`、固定构建顺序、seed sync 和 after-pack freshness checks，但覆盖的是内置 official seed，不等于市场发布包审计。
- Builder 会生成 `dist/out`、`dist/build` 和 `.tpex`，并排除旧 `out/build/*.tpex` 回灌。

## Requirements

1. 建立受版本控制的发布目标清单，声明 plugin workspace、package name、Manifest path、所需 build/test/typecheck/lint 命令和允许的缺省门禁。
2. clean build 必须先清理可重建输出，再按 CLI core、Vite/plugin prerequisites、目标插件顺序构建；不得消费工作区残留 `.tpex` 或 stale `dist/build`。
3. 每个目标先通过 strict package policy 和插件自有 tests/typecheck/lint，再生成最终包；缺失声明的必需门禁不得静默跳过。
4. 审计最终包的 Manifest identity/version、entry inventory、压缩/展开大小、`_files` 覆盖、artifact SHA-256、scan decision 和签名状态。
5. 生成 machine-readable build audit，记录 source revision、dirty-state policy、工具版本、命令退出码和 artifact path/digest；不收录完整日志或 secret。
6. canonical build 与 bundled/runtime projection 如同时存在，必须按内容比较；版本相同不能替代 freshness 证明。

## Acceptance Criteria

- [ ] 在 clean checkout/隔离输出目录中按目标清单构建所有选定 official plugins，任何 prerequisite 或 plugin gate 失败即停止。
- [ ] 每个目标都有 build/test/typecheck/lint/package-policy/scan/signature 的明确结果；不适用项必须在 registry 中显式说明。
- [ ] 重复两次构建得到相同的规范化 entry inventory 和内容摘要；若 archive 容器含时间戳，报告明确区分容器差异与内容差异。
- [ ] stale `.tpex`、nested `dist/build`、未哈希文件、Manifest/package 版本不一致和过期 bundled projection fixture 均被拒绝。
- [ ] machine-readable audit 可被后续发布证据 verifier 消费，并绑定 source revision 与最终 artifact SHA-256。
- [ ] official plugin focused builds/tests、审计器 tests、lint/typecheck 通过。

## Out of Scope

- 自动发布到 Nexus。
- 第三方私有源码托管或远程 CI 供应商接入。
- Nexus 人工审核和 Store 展示。
- CoreApp OTA package build。

