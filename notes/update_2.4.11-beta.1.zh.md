# Tuff v2.4.11-beta.1 更新说明

## 本次更新

- 合入 PR #270 / #271 并完成冲突收口：Touch Intelligence 回答、占位、等待与错误状态会保持 CoreBox 会话可见，避免 AI 请求执行中被自动隐藏。
- 新增 TouchWidget beta runtime 基线：支持 ArrowJS 与 WebComponent Widget，CLI 预编译会写入 runtime / runtimeStage 元数据，CoreApp renderer 可按运行时挂载。
- 加强插件 shell capability 诊断：Browser Open、System Actions、Window Manager 与 Workspace Scripts 在执行前暴露平台、权限、unsupported reason 与 audit 元数据，并在 safe-shell 不可用时 fail closed。
- 补齐 Cloud Share / snippets 工作流：snippet pack 发布、列表与安装复用账号 token typed event，避免新增 raw channel 依赖。
- 修复合并后的 CI 阻塞：tuff-cli-core lint、builder widget test、utils transport boundary 与 touch-snippets 回归已在本地和 master CI 通过。
- 继承近期 CoreBox 可见体验、App Index packaged evidence、Provider Registry observability、Nexus provider migration readiness 与本地 AI runtime 可见性改进。

## 已验证

- master 最新提交的可见 GitHub checks 已通过：Tuff CLI Package CI、OmniPanel Gate、CodeQL、Update release draft 与 Cloudflare Pages。
- 本地已通过 apps/core-app typecheck、核心 widget / intelligence / plugin 回归、packages/utils 全量测试、tuff-cli-core lint/build/test、touch-snippets 测试与 macOS snapshot package。
- 本地 snapshot 产物 `apps/core-app/dist/tuff.app.zip` 已生成并完成 macOS app `codesign --verify --deep --strict` 验证。

## 已知限制

- 该版本是 `2.4.11` beta 测试包，不代表正式 release gate 已完成。
- Windows 真机 acceptance、性能采样与 Nexus Release Evidence 写入仍需后续补齐；Linux 仍按 documented best-effort 处理。
