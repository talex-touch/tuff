# Everything SDK 集成落地状态（Rollout Status）

## 范围与目标

- 范围：`apps/core-app` 的 Everything 搜索后端、`packages/tuff-native` 原生能力、设置页状态展示与文档。
- 目标：Windows 平台优先走 SDK（N-API），异常时自动回退 CLI（`es.exe`），不可用时优雅降级。

## 状态快照（截至 2026-02-08）

### 已完成（Done）

1. **后端链路（SDK 优先 + CLI 回退）**
   - `everything-provider` 已支持 `sdk-napi -> cli -> unavailable` 回退链路。
   - `everything:status` / `everything:test` 已补 backend 相关字段（backend、fallbackChain、lastBackendError）。

2. **设置页与多语言文案**
   - Settings 页面已展示当前后端、回退链路、后端错误信息。
   - `backendErrorTitle` 文案键位已归位到 `settings.settingEverything`。

3. **Native 包与构建**
   - `packages/tuff-native` 已新增 `everything` 导出与类型声明。
   - `binding.gyp` 已补 `tuff_native_everything` target，并修复跨平台构建配置。
   - `native/src/everything/addon.cc` 已从 stub 升级为 Windows 实际 SDK 查询实现（动态加载 DLL + 查询结果归一化）。

4. **验证与测试**
   - 新增 fallback 单测：`SDK 失败 -> CLI`、`SDK 失败且 CLI 不可用 -> unavailable`。
   - 新增 Windows 自检脚本：`check:everything`，可直接验证 SDK 是否生效。

### 进行中（In Progress）

1. **Windows 真机回归**
   - 需要在 Windows 环境跑自检并留存样例结果（版本号、结果条数、耗时）。

2. **与 AI 能力联动（第 1 步）**
   - 计划将 Everything 的检索结果作为 AI 能力的上下文输入源之一（当前未完成）。

### 待办（Todo）

1. **Windows 冒烟验证清单固化**
   - 输出固定模板（环境、命令、结果 JSON、截图/日志路径）。

2. **异常分层可观测性**
   - 在 SDK 加载失败、查询失败、CLI 回退失败三层增加更稳定的错误码归类。

3. **性能对照基线**
   - 建立 SDK / CLI 在同一查询集上的耗时对照报表。

## 关键文件清单

- Provider：`apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- Settings UI：`apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- i18n：
  - `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
  - `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- Native：
  - `packages/tuff-native/native/src/everything/addon.cc`
  - `packages/tuff-native/binding.gyp`
  - `packages/tuff-native/everything.js`
  - `packages/tuff-native/everything.d.ts`
- 测试：`apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- 自检脚本：`packages/tuff-native/scripts/everything-selfcheck.js`

## 统一验证命令

> 在仓库根目录执行。

### 本地（任意平台）

```bash
pnpm -C "packages/tuff-native" run build
pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts"
```

### Windows 真机（必须执行）

```bash
pnpm -C "packages/tuff-native" run check:everything -- --query "*.txt" --max 10
```

期望输出字段：`ok`、`version`、`resultCount`、`sample`。

## 风险与回滚

1. **DLL 位数/路径不匹配**
   - 风险：SDK 不可加载。
   - 处理：自动回退 CLI；必要时设置 `TALEX_EVERYTHING_DLL_PATH` 指向明确 DLL。

2. **SDK 查询异常**
   - 风险：搜索失败或结果异常。
   - 处理：运行时自动尝试 CLI；状态页展示 `lastBackendError`。

3. **Windows 环境差异**
   - 风险：开发机可编译但线上机不可用。
   - 处理：以 Windows 自检 JSON 作为发布前门禁项。

## 后续优先级建议

- P0：完成 Windows 真机自检留档与回归。
- P1：完成 AI 能力联动第 1 步（检索上下文接入）。
- P2：补性能基线报表与错误码统计面板。
