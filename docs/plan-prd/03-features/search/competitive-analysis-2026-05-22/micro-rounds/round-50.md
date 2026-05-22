# 微审计 50/70

- 审计主题

uTools `plugin.json` / `cmds` 的低门槛插件声明，是否已经被 Tuff 映射到更严格的 Manifest `features[].commands`、`acceptedInputTypes`、`sdkapi hard-cut` 与 `tuff validate` 边界，而不是只在主文档里抽象描述。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
   - 第 2 节把 uTools `plugin.json` 拆成 `main`、`features`、`cmds`、动态指令、AI Agent tools 与发布审核，并明确 Tuff 不应照搬鼠标超级面板。
   - 第 3 节把 Tuff 当前能力列为 Manifest / Prelude / Surface、`sdkapi` hard-cut、权限模型、`acceptedInputTypes` / `TuffQuery.inputs`、插件触发和发布任务流。
   - 第 4 节把搜索框关键字、文本匹配、图片匹配、文件触发、AI 制作插件分别映射到 Tuff `features[].commands`、`acceptedInputTypes`、`TuffQuery`、Context Actions 与 validate / permission evidence。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
   - 第 2.3 节指出 uTools 低门槛来自插件市场、`plugin.json`、preload/API、调试工具和 AI 插件制作；Tuff 应吸收“输入数据源 -> 插件动作”的心智，但不能牺牲 hard-cut 与权限边界。
   - 第 3 节把 Tuff 当前生态证据列成官方插件集合、Manifest / Prelude / Surface、`sdkapi` hard-cut、权限与 capability、CLI validate、`.tpex` preview 与 package integrity。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
   - 第 5 节将 uTools 插件跨平台路线收敛为 `acceptedInputTypes`、`TuffQuery.inputs`、`sdkapi hard-cut`、permission reason、Nexus Store -> Context Actions v1、fail-closed reason、SDK 任务流。
   - 第 6 节明确不要绕过 `sdkapi` / 权限 / secure store，也不要复制 uTools 鼠标超级面板。
4. `packages/utils/plugin/sdk-version.ts`
   - `CURRENT_SDK_VERSION` 为 `260428`。
   - `SUPPORTED_SDK_VERSIONS` 是插件声明 `sdkapi` 的 canonical allowlist。
   - `checkSdkCompatibility()` 对缺失、非法、低于 `251212`、unsupported / future marker 都返回 `compatible: false`，并建议升级到当前 marker。
5. `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`
   - `getPluginSdkHardCutGate()` 对 `missing-sdkapi`、`invalid-sdkapi`、`outdated-sdkapi`、`unsupported-sdkapi` 都返回 blocked。
   - `unsupported-sdkapi` 明确不是 warning-only 路径，而是 `SDKAPI_BLOCKED` 的运行时阻断原因。
6. `packages/tuff-cli-core/src/validate.ts`
   - manifest validate 直接复用 `checkSdkCompatibility()` 与 `resolveSdkApiVersion()`；不兼容 `sdkapi` 进入 errors。
   - 已支持 canonical 但低于当前推荐值时只给 outdated warning，符合“历史 canonical 可迁移、非 canonical 阻断”的边界。
7. `plugins/*/manifest.json`
   - 只读扫描显示官方插件 manifest 均声明 `sdkapi: 260428`。
   - 多数官方插件已用 `features[].commands` 与 `acceptedInputTypes` 表达可搜索命令和输入类型，例如 `clipboard-history` 支持 text / image / files / html，`touch-translation` 支持 text / image，`touch-batch-rename` 支持 files / text。

- 结论

主文档对该映射点的判断成立：Tuff 没有把 uTools `plugin.json/cmds` 简单复制成另一个宽松声明文件，而是把它拆成三层更可审计的合同。

1. 声明层：Tuff Manifest 通过 `features[].commands` 与 `acceptedInputTypes` 承接 uTools `cmds` 的搜索框触发、文本/图片/文件输入心智。
2. 运行边界：`sdkapi` 当前 marker 是 `260428`，缺失、非法、过旧、unsupported / future marker 都会在共享 SDK、CoreApp runtime gate 和 CLI validate 中被阻断。
3. 生态边界：官方插件 manifest 已统一到当前 marker，说明主文档把 `sdkapi hard-cut` 写成生态安全边界不是空泛要求。
4. 产品缺口：目前仍缺的是 Context Actions v1 与 evidence 样板，让用户看见 input source、matched command、permission reason、provider health、失败原因和 Store / `.tpex` 发布链路；不是缺最基础的 manifest / command / sdkapi 机制。

因此，后续不应为了“像 uTools 一样低门槛”放松 `sdkapi`、permission reason 或 package preview。更小的正确下一步是选一个官方插件，例如 `touch-snippets`、`touch-translation` 或 `touch-browser-data`，补一条从 manifest validate、local install、CoreBox 触发、Context Action 展示到 Nexus package preview 的 evidence。

- 是否发现需修正的主文档问题

否。`04-utools-plugin-cross-platform.md`、`08-plugin-store-sdk-ecosystem.md` 与 `10-execution-roadmap-synthesis.md` 对该点的口径与源码一致：当前已有 Manifest / Prelude / Surface、`features[].commands`、`acceptedInputTypes`、`sdkapi hard-cut` 和 CLI validate 基线；缺口被正确定位为 Context Actions、失败 reason、发布/安装 evidence 与 Store 可见性，而不是主机制不存在。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-50.md`，未修改业务代码、未修改 01-11 主分析文档、未修改 `docs/INDEX.md` / README / TODO / CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
