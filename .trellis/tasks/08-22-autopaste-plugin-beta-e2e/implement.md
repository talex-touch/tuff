# 实施计划

## 1. 基线与复现

- 运行 AutoPaste、插件安装确认、JSON 输入、Clipboard 搜索/OCR、Translation Provider 的现有聚焦测试。
- 构建当前插件并用隔离 CoreApp 复现真实失败；只修复可观察缺陷。
- 核对生产 Nexus 当前稳定版本、官方身份和 owner，不接触 `.dsh-plugin-hub-*` 并发产物。

## 2. 收敛实现

- 统一三个插件的宿主主题同步，覆盖显式 Light、显式 Dark 与系统 Auto。
- 修复 JSON Formatter 首次输入读取与后续输入订阅，保持 typed SDK 与卸载清理。
- 若真实 AutoPaste/安装链路复现重复确认或静默失败，在现有队列/权限/诊断 owner 内修复，不在插件侧旁路。
- 若 Clipboard 搜索、OCR 或 Translation 失败，沿已有 SQLite OCR 与 Host Translation Provider 边界修复根因。

## 3. 聚焦验证

- CoreApp：AutoPaste/安装确认相关 Vitest，必要的 node/web typecheck。
- JSON Formatter：typecheck、lint、build、manifest/package validation。
- Clipboard History：test、typecheck、build、raw-channel guard。
- touch-translation：test、typecheck、lint、build。
- 主题：Light/Dark 真实 UI；功能：JSON 自动输入、Clipboard 自动搜索+真实 OCR、Translation 真实 Provider。

## 4. BETA 构建与 Nexus

- 将三个插件分别升级到 PRD 指定 BETA 版本并重新构建 `.tpex`。
- 逐个记录 SHA-256，执行 `tuff publish --channel BETA`，保留原 publisher identity。
- 使用受支持的审核 API 审核确切版本；核验 `approved/passed/passed/eligible` 与 Nexus attestation。
- 通过生产 BETA 下载端点取回确切版本，比较 SHA-256。

## 5. 从未安装到完整验收与录屏

- 创建隔离 profile，确认三个插件均未安装。
- 每个插件分别启动独立录屏：生产 Nexus 搜索/下载 -> 安装确认 -> 权限 -> 启用 -> Light -> Dark -> 功能成功。
- Translation 无 Provider 时依次尝试 CoreApp CC Switch/CLI 导入、现有安全 Provider、Ollama 小模型；只录最终非敏感结果。
- 验证 AutoPaste 回填到受控测试输入框；恢复剪贴板和系统主题。

## 6. 收尾

- 运行 Trellis 质量检查与最小全范围门禁。
- 更新 `ques.md`：只保留仍无法自行解决的问题，否则写“无”。
- 保存三段可播放录屏及发布/下载摘要，不保存 Token、Key、原始 profile 或完整日志。

## 7. 执行结果（2026-08-22）

| 插件 | 最终 BETA | SHA-256 | Nexus 门禁 |
|---|---|---|---|
| JSON Formatter | `1.0.9-beta.4` | `b3739efa65082998bb3cb52aa3ae2e15e94c4e9c83f4e5c88d7d891c951536f0` | approved / scan passed / policy passed / eligible / attested |
| Clipboard History | `1.1.13-beta.2` | `a68503c35081ddf2602c4256ee77aee977899379afb9dd5ca670eec96685a321` | approved / scan passed / policy passed / eligible / attested |
| touch-translation | `1.0.18-beta.4` | `bb0a59a48271178380aeba56aefda82ae040bb40786ce36d5c4ea4dd4ab52eb6` | approved / scan passed / policy passed / eligible / attested |

- JSON Formatter：从未安装状态经 Nexus 安装后，CoreBox 初始 JSON 自动进入编辑器，格式化结果可见；Light/Dark 均通过。
- Clipboard History：CoreBox 查询自动筛选 SQLite 历史；macOS Vision OCR 显示 `OCR E2E 2026`；Light/Dark 均通过。
- touch-translation：补齐 Translation Prelude 的声明式 Widget 推送能力与查询匹配，最终由本机 Ollama `qwen2.5:3b` 经宿主 `text.translate` 返回可见译文；Light/Dark 均通过。
- AutoPaste：27 个聚焦测试覆盖鲜度/资格、Action Panel、剪贴板写入、CoreBox 隐藏、平台粘贴快捷键和显式失败归一化。
- 录屏目录：`~/Desktop/Tuff-Plugin-Beta-E2E-2026-08-22/`，仅保留三个最终 MP4；均为 H.264、4112×2658、30fps，并通过 `ffprobe`。
- 最终验证：Translation 插件 20 tests；宿主 Translation/Widget/Plugin 60 tests；CoreApp node typecheck；插件 lint/typecheck/build；25/25 插件包策略验证。
