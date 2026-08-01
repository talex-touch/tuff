# 技术设计：设置页区块层级、默认值与平台标签

## Scope

本任务覆盖 CoreApp 设置页渲染、APP_SETTING 默认配置、主进程读取边界及相关测试。现有字段和 transport contract 不变，不新增设置页面、持久化迁移版本或 IPC/SDK。

## 1. 高级设置分层

继续使用现有 `showAdvancedSettings = Boolean(appSetting.dev.advancedSettings)`：

- `SettingTools.vue`：给自动粘贴、自动清除、自动隐藏三个现有控件增加高级设置可见性条件。
- `SettingSetup.vue`：给静默启动和 OmniPanel 自动装载增加高级设置可见性条件；Dock 项同时满足高级设置、macOS 和 tray capability 可用。
- 控件的 `v-model`、更新函数、存储字段和运行时调用保持不变。隐藏只影响渲染，不重置配置。

## 2. 默认值与缺失字段归一化

规范默认来源仍为 `packages/utils/common/storage/entity/app-settings.ts`，以下字段改为 `true`：

- `setup.hideDock`
- `window.startSilent`
- `omniPanel.autoMountFirstFeatureOnPluginInstall`

APP_SETTING 水合是顶层浅合并，历史配置的嵌套对象可能缺字段，因此所有直接读取边界遵循同一规则：

```ts
const resolved = typeof storedValue === 'boolean' ? storedValue : canonicalDefault
```

这会保留显式 `false`，仅把 `undefined`、`null` 或无效类型回退为规范默认。需要同步的边界：

- Renderer：`SettingSetup.vue`、`SettingTools.vue`，以及虽未挂到当前 AppSettings 但仍保留的 `SettingWindow.vue`。
- Main tray：`common.ts` 的 tray snapshot/update fallback 与 `tray-manager.ts` 的直接读取。
- Main OmniPanel：settings snapshot 和 feature registry 持久化时的缺失字段 fallback。
- Silent launch：配置字段缺失时使用新默认，但受 onboarding 门禁约束。

不写一次性迁移，不覆盖已持久化的 boolean 值。

## 3. 首次引导保护

扩展 `SilentLaunchSettings` 读取 `beginner.init`。静默信号优先级保持：

1. secondary launch data
2. 显式 argv (`--silent` / `--hidden`)
3. Electron login-item hidden signal
4. APP_SETTING 中的 `window.startSilent`

仅第 4 类配置来源增加条件：`beginner.init === true` 且 `startSilent` 解析为开启时才返回 silent。这样新用户配置默认开启但首次引导仍可见；缺失 onboarding 状态不被视为已完成。显式启动信号的既有语义不变。

## 4. macOS 标签与文案

保留 `TuffMacOSTag` 的组件 API、Apple 图标、颜色和尺寸，只把默认 locale 值改为：

- zh-CN：`仅限`
- en-US：`Only`

同步修改组件内 fallback。删除 `settings.setup.hideDockDesc` 中重复的 `(macOS only)`；不删除描述里为解释系统权限而必须出现的 macOS 技术名词。

## 5. 设置页顶层间距

由 `AppSettings.vue` 页面容器统一拥有顶层布局：

- `display: flex`
- `flex-direction: column`
- `gap: 12px`

在 `.AppSettings-Container` 作用域内清除直接可见顶层 `TGroupBlock-Container` 的遗留 `margin-bottom`，不修改共享 `TuffGroupBlock.vue`，避免影响插件页和智能页。

设置页内 `TBlockSlot-Container` 保留 `56px` 最小高度，但使用 `height: auto` 和页面作用域内的垂直 padding；英文或窄窗口描述换行时由内容撑高，避免固定行高造成相邻项重叠。

`file-index` 与 `everything` 的条件放在直接包装节点上，或确保包装节点在无内容时不成为 flex item；独立 `SettingStorage` 入口与普通 group 同样参与 12px gap。

## 6. Test Strategy

### Renderer

- RED：关闭高级设置时六个目标控件不存在；开启后存在，原值不变。
- RED：三个缺失字段归一化为 `true`，显式 `false` 保留。
- RED：macOS tag 显示 Apple 图标与 `仅限 / Only`，Dock 描述无重复平台后缀。
- RED：AppSettings 条件包装节点不为空占位，页面容器间距 contract 为 12px。

### Main

- RED：silent-launch 在 onboarding 未完成或状态缺失时忽略配置默认；仅完成后按开启配置静默；显式信号优先级不变。
- RED：tray 与 OmniPanel 对缺失/无效字段回退 `true`，显式 `false` 保留。

### Visual

在设置页分别关闭和开启高级设置检查：

- 六个目标项的显示层级正确。
- 相邻可见顶层区块间距均为 12px，隐藏条件区块不留空白。
- macOS 标签缩短后标题和描述不挤压、不重叠。
- 折叠/展开区块无布局跳动。

## Compatibility And Rollback

- 不改变设置 key、transport payload 或持久化格式，回滚只需恢复可见性、默认值和样式。
- 已有 boolean 配置不被重写；风险集中在缺失字段采用新默认以及静默启动首次引导门禁。
- 当前工作树中 locale 文件已有其他任务修改，实现时必须做局部编辑，不覆盖或重排无关变更。
