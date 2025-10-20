# 插件加载重构说明

## 1. 当前异常现象与原因分析
- **重复 reload 循环**：日志中 `plugin metadata loaded` 与 `文件变更` 交替出现，两个不同目录 (`touch-translation`, `quicker-open`) 持续互相触发。原因是两者 `manifest.json` 内 `name` 均为 `Quicker Open`，在 `apps/core-app/src/main/modules/plugin/plugin-module.ts:333` 处命中同名检测，`quicker-open` 被标记为 `LOAD_FAILED`。加载失败后仍继续写入 manifest，引发 `LocalPluginProvider` 的文件监听 (`plugin-module.ts:538-578`) 再次触发 reload，形成死循环。
- **Dev 模式自写 manifest**：`DevPluginLoader` 每次加载都会把远程 manifest 覆写到本地，若目录名与 manifest name 不一致，就会不断触发上述循环。
- **Provider 日志缺失**：安装流程缺乏足够信息，难以追踪具体 provider、下载链接、风险确认等步骤的状态。

## 2. 目标加载流程
### 2.1 Provider 统一入口
- 所有来源（GitHub/NPM/TPEX/网络等）最终都要生成本地路径，由 `FilePluginProvider` 负责交给内部 loader。
- 新增 `providers/registry.ts`，集中注册/日志化 provider，外部通过 `installFromRegistry()` 统一进入；默认 provider 在 `PluginInstaller` 构造时注册。
- Provider 需要在 `install()` 阶段输出关键信息（解析结果、下载 URL、本地文件路径、官方认证状态等）。

### 2.2 Manifest 与 Dev 流程
- **普通模式**：`loadPlugin()` 读取本地路径的 manifest；若 missing 则落入 `MISSING_MANIFEST` 分支。
- **Dev 模式 (`dev.enable=true`)**：
  - 若 provider 只提供 manifest 文本（无路径），必须抛出或追加问题，提示 “无法热更新，请手动 reload”。
  - 若存在真实路径，则交由 `LocalPluginProvider` 监听并热更新。
- **Source 模式 (`dev.source=true`)**：
  - manifest 仍通过本地流程触发，但实际资源由 Dev Server 提供；`LocalPluginProvider` 只负责初始加载，不再响应后续本地文件变更。
  - 依赖 `/_tuff_devkit/update` 心跳检测 Dev Server 状态；失败时进入 `DEV_DISCONNECTED`，仅用户手动 reload 或崩溃自恢复时重走完整安装流程。

### 2.3 Reload 触发规则
- 热更新仅由以下场景触发：
  1. `LocalPluginProvider` 监听到变更（仅在非 Source 模式）。
  2. Dev 心跳检测到版本更新（Source 模式）。
  3. 用户在前端手动执行 disable/reload。
  4. 插件崩溃触发自动恢复。
- 重复加载前需检查 `loadingPlugins`，避免正在加载时的自触发；同名插件直接进入 `DUPLICATE_PLUGIN_NAME`，并阻断后续步骤。

## 3. 新增日志点
- `providers/logger.ts` 提供统一命名空间；`registry.ts` 记录 provider 注册、解析与安装耗时。
- GitHub/NPM/TPEX/File provider 均在安装链路中输出解析、下载、成功/失败日志。
- `LocalPluginProvider` 在监听启动/停止、文件追踪时输出调试信息，方便比对截图中的文件事件。

## 4. 待补充校验项
- Provider 需要在 Dev 模式下明确返回 path/文本的差异提示。
- `_tuff_devkit/update` 心跳策略需配套实现（当前仅在 PRD 中规划）。
- 当同名冲突持续发生时，考虑自动忽略加载失败的目录或提示用户移除冗余副本。

> 本文档结合 `plan-prd/view-mode-prd.md` 的设计约束，用于后续实现与调试的参考。
