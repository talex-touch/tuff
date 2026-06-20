# Tuff v2.4.12-beta.8 更新说明

## 本次更新

- 加固 Release Integrity 本地与远端门禁：GitHub Release metadata、manifest/core artifact/signature sidecar inventory、Nexus asset matrix、canonical signature URL、signed download URL 和 latest-channel 指针校验继续收紧。
- 本地 release gate 现在同时校验 source 与 packed npm manifests，防止打包后的发布清单重新出现 `catalog:`、`workspace:`、`file:` 或 `link:` 依赖声明。
- 收紧 AI 2.5.0 Stable evidence 合同：CoreBox AI Ask 成功截图必须展示非空回答、provider/model/latency/trace/input kind metadata；同一截图或录屏不能复用关闭多个 `AI-STABLE-*` 固定证据项。
- 推进 Search / Indexing Runtime hygiene：共享 snapshot clone、progress evidence、scan eligibility、watch delta queue、worker status、flush snapshot 与 task-state 边界都加强了空值、重复值、负数时间戳和嵌套对象污染防护。
- FileProvider scan progress / reset / strategy / watch 相关服务继续向统一 Indexed Source runtime/store/task 边界收口，减少 Settings diagnostics 被历史 root、空路径或旧异步结果污染的风险。

## 已验证

- `pnpm quality:pr`
- `pnpm publish:check`
- `pnpm publish:check:pack`
- Release gate focused tests：`scripts/check-release-gates/local-checks.test.mjs` 与 `remote-checks.test.mjs`，共 42 个用例通过。
- AI evidence focused tests：`coreapp-packaged-ai-ask-probe.test.ts` 与 `coreapp-visible-experience-evidence.test.ts`，共 26 个用例通过。
- Search / Indexing focused tests：`packages/utils` search 相关 104 个用例通过，CoreApp FileProvider / task-state 相关 58 个用例通过。
- `git diff --check`

## 已知限制

- 该版本仍是 beta 测试包，不代表 Gate E 真实 GitHub Release ↔ Nexus 资产、下载、签名与 latest endpoint evidence 已闭环。
- AI Stable 真实 packaged Electron evidence 仍只部分覆盖 `AI-STABLE-06` / `AI-STABLE-07`；`AI-STABLE-01` 到 `AI-STABLE-05` 以及 `AI-STABLE-08` 仍需补截图/录屏和 trace。
- FileProvider SQLite/FTS 完整写入迁移、source-scoped `scan_progress` schema migration、durable scheduler/retry/debounce 与真实平台 evidence 仍需继续收口。
