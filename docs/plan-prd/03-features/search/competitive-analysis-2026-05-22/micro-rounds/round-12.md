# 微审计 12/70

## 审计主题

uTools `plugin.json` 的低门槛插件开发心智，是否能映射到 Tuff 当前更严格的 Manifest + `sdkapi` hard-cut + `tuff validate` + Store 安装失败可读化链路。

本轮只审一个具体映射点：Tuff 是否真的把“容易创建插件”和“不放松生态安全门槛”同时落到了 create / validate / runtime loader / installer / Store error reason，而不是只在主分析文档里宣称比 uTools 更可审计。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节把 uTools `plugin.json` / `cmds` / 插件市场映射到 Tuff Manifest / Prelude / Surface、`sdkapi`、权限模型、Nexus Store、tuff-cli。
  - 第 3 节明确：Tuff 的 `sdkapi` hard-cut 是比 uTools 更适合可审计生态的基础，不应为了兼容旧插件放松。
  - 第 7.1 节要求 `tuff create` 默认生成 `sdkapi: 260428`，`tuff validate --strict` 阻断缺 `sdkapi`、非 canonical marker 等问题。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
  - 第 1 节判断：Tuff 当前生态底座已有 Manifest / Prelude / Surface、`sdkapi` hard-cut、CLI validate/build/publish、Nexus Store 和 `.tpex` package preview，但缺端到端 evidence。
  - 第 3 节把 `sdkapi` hard-cut、CLI validate、`.tpex` package preview、审核状态和 Store 失败 reason 列为当前证据快照。
  - 第 6 节强调：AI 生成插件只能是草稿，发布前必须走 `tuff validate --strict`、sdkapi、权限和 package scan。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 61 条确认 `CURRENT_SDK_VERSION = 260428`，missing / invalid / outdated / unsupported 都 blocked。
  - 第 62 条确认 CLI validate 复用 runtime gate，unsupported marker 会成为 error。
  - 第 120 条总结：`sdkapi 260428` hard-cut、`tuff validate`、`.tpex` integrity、Nexus moderation 有基础，但 integrity 不是 security scan。
- `packages/utils/plugin/sdk-version.ts`
  - `CURRENT_SDK_VERSION` 为 `260428`。
  - `SUPPORTED_SDK_VERSIONS` 是 canonical allowlist。
  - `checkSdkCompatibility()` 对 missing、invalid、低于 `251212`、非 supported marker 都返回 `compatible: false`，并给出升级建议。
  - `resolveSdkApiVersion()` 对未知 current/future marker 返回 `undefined`，不会把未来 marker 当成已支持版本。
- `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`
  - `getPluginSdkHardCutGate()` 把阻断原因归一为 `missing-sdkapi`、`invalid-sdkapi`、`outdated-sdkapi`、`unsupported-sdkapi`。
  - 阻断消息统一建议更新到当前 `CURRENT_SDK_VERSION`。
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
  - loader 读取 manifest 后先执行 SDK hard-cut gate。
  - 被阻断的插件会写入 `SDKAPI_BLOCKED` issue、记录 declared/resolved/current/reason，并把 load state 设为 `load_failed`。
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
  - 本地 / Store 安装预处理会在 manifest 解析后执行 `assertManifestSdkCompatibility()`。
  - 被阻断时抛出带 `code: SDKAPI_BLOCKED` 的错误，不进入正常安装。
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
  - 安装前权限确认前会先跑 `getPluginSdkHardCutGate()`；sdkapi 不兼容时直接抛错，避免把 blocked 插件伪装成权限待确认。
- `packages/tuff-cli-core/src/validate.ts`
  - `runValidate()` 复用 `checkSdkCompatibility()` 和 `resolveSdkApiVersion()`。
  - 不兼容 sdkapi 进入 errors；旧但 supported marker 进入 warning；`--strict` 会把 warning 升级为 error。
  - `sdkapi >= 260114` 时缺 `category` 会报错；未知权限也会报错。
- `packages/tuff-cli-core/src/__tests__/validate.test.ts`
  - 覆盖非 canonical marker `260421` 被拒绝。
  - 覆盖 future marker `260501` 被拒绝。
  - 覆盖历史 supported marker `260228` 可通过但有升级 warning。
- `packages/tuff-cli/src/cli/commands/create.ts`
  - 默认 manifest 创建时写入 `sdkapi: CURRENT_SDK_VERSION`、`category: "utilities"`、最小 `storage.sqlite` 权限和 `permissionReasons`。
  - 从模板创建时，`shouldRewriteSdkapi()` 会把非法、非兼容、未解析或低于当前版本的模板 sdkapi 改写为 `CURRENT_SDK_VERSION`。
- `packages/test/src/common/sdk-version.test.ts`
  - 覆盖当前 marker 是 `260428`。
  - 覆盖 unknown / future marker 不被 normalize。
  - 覆盖 bundled plugins 必须全部等于 `CURRENT_SDK_VERSION`。
- `apps/core-app/src/renderer/src/composables/store/store-install-error-utils.ts`
  - Store 安装失败会把 `SDKAPI_BLOCKED`、缺 sdkapi、非法 sdkapi、低于最低版本、hard-cut gate message 映射为本地化 reason。
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
  - Store 安装失败里已有 `sdkapiBlocked`、`sdkapiMissing`、`sdkapiInvalid`、`sdkapiOutdated` 中文文案。

## 结论

主文档对这个映射点的判断成立：Tuff 当前不是简单复刻 uTools 的低门槛 `plugin.json`，而是把 Manifest 开发体验和 `sdkapi` 生态门禁绑在了一起。`tuff create` 会把新插件带到当前 canonical marker；`tuff validate` 会在发布前拦住非 canonical / future marker；CoreApp loader、installer 和安装前权限确认都会在运行前阻断不兼容插件；Store 安装失败也不会只暴露 raw `SDKAPI_BLOCKED`。

当前事实链路是：

1. 创建层：`tuff create` 默认生成 `sdkapi: 260428`、`category`、权限和权限理由；旧模板 marker 会被改写到当前版本。
2. 校验层：`tuff validate` 复用共享 SDK allowlist，不支持的 marker 是 error；旧 supported marker 只是 warning，strict 下会失败。
3. 运行层：loader 把 sdkapi 不兼容写成 `SDKAPI_BLOCKED` load error 和 issue，阻止插件进入正常运行。
4. 安装层：installer 和 install queue permission confirmation 前都会先跑 hard-cut gate，blocked 插件不会进入“等待授权”的假路径。
5. 用户可见层：Store 安装失败会把 sdkapi 缺失、非法、过旧和 blocked 映射为中文可读 reason。

这说明主文档中“像 uTools 一样容易上手，但比 uTools 更可审计”的方向不是空泛口号。Tuff 已经把 `plugin.json` 类心智拆成更明确的 Manifest 字段、SDK marker、权限理由、CLI 校验和安装失败语义。

但这条链路仍不等于完整插件生态闭环：

- `tuff validate` 目前主要覆盖 manifest、sdkapi、category 和权限 registry；主文档要求的 permission reason 完整度、平台声明一致性、危险权限说明、package policy / security scan 仍需要后续 evidence。
- Store 能把 sdkapi 安装错误转成可读 reason，但还没有证明完整 `.tpex -> preview -> pending -> approved/rejected -> install -> first run` 的样板链。
- `.tpex` integrity 和 sdkapi hard-cut 只能证明包内容一致和 SDK marker 合规，不能被包装成恶意代码安全审计。
- AI 生成插件如果后续接入，必须继续走同一套 `tuff validate --strict`、hard-cut、权限和审核链，不能因为“AI 制作插件”降低门槛。

因此，主文档建议 P0/P1 继续补 plugin ecosystem loop v1、Store trust summary 和 package policy baseline 是合理的。下一步应把现有 hard-cut 链路变成一条端到端 release evidence，而不是新增平行插件创建器或放松旧插件兼容。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。现有文档对该映射点的边界是准确的：Tuff 已有 `sdkapi` hard-cut 与 CLI / runtime / installer / Store 可读失败基础，但仍缺端到端生态 evidence；同时文档没有把 `.tpex` integrity 或 sdkapi gate 误写成完整 security scan。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-12.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
