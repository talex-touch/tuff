# 统一设置页区块层级与平台标签

## Goal

精简默认设置页，把低频行为项收纳到全局“高级设置”模式，并统一 macOS 专属项标签与设置区块间距，降低基础设置页的信息密度。

## Background

当前设置页的“通用配置”和“实用工具”在未开启高级设置时仍展示多项低频配置。现有页面已经通过 `appSetting.dev.advancedSettings` 控制高级项可见性，可以沿用该机制，不新增页面或配置层级。

macOS 专属项统一使用 `TuffMacOSTag`，当前标签为 Apple 图标加“仅限 macOS”；个别描述文案还重复包含“macOS only”。

## Requirements

1. 在“实用工具”中，仅当全局高级设置开启时展示以下配置：
   - 自动粘贴
   - 自动清除
   - 自动隐藏
2. 在“通用配置”中，仅当全局高级设置开启时展示以下配置：
   - 不在 Dock 栏显示
   - 静默启动
   - 安装后自动装载 OmniPanel Feature
3. 上述高级设置分层不改变存储字段、控件运行时语义或用户当前配置值；行为变化仅限第 5 条定义的缺失字段默认值和第 6 条首次引导保护。
4. 所有使用统一 macOS 平台标签的设置项改为 Apple 图标加“仅限”；对应标题和描述不再重复出现“macOS only”“仅限 macOS”等平台限定文字。
5. “不在 Dock 栏显示”“静默启动”“安装后自动装载 OmniPanel Feature”的产品默认值改为开启：新用户和字段缺失的配置使用新默认值，已有用户明确保存的 `false` 必须保留，不做强制迁移。
6. 首次引导必须保持可见：即使静默启动采用开启默认值，在 `beginner.init !== true` 时主进程也不得因该配置隐藏首次引导窗口；引导完成后按配置正常生效。
7. 设置页各可见顶层区块（包括独立“存储”入口与 `TuffGroupBlock`）统一使用 `12px` 垂直间距；调整应限定在设置页容器，不改变该共享组件在插件页、智能页等其他界面的布局。条件区块隐藏时不得由空包装节点产生额外间距。
8. 中英文文案保持语义一致。

## Technical Notes

- `packages/utils/common/storage/entity/app-settings.ts` 是新配置的规范默认来源，但历史配置以浅层对象载入；三个字段还需在主进程各直接读取路径采用“值为 boolean 则保留，否则回退规范默认”的规则。
- `SettingSetup.vue`、`SettingTools.vue`、`SettingWindow.vue` 与 OmniPanel/Tray/Silent Launch 主进程路径存在本地缺失字段兜底，不能继续写死 `false`，否则会覆盖新默认。
- 静默启动解析必须同时检查 onboarding 状态；`beginner.init !== true` 时忽略配置来源的开启默认值，避免首次安装窗口不可见。
- `AppSettings.vue` 应由页面容器以纵向 `gap: 12px` 管理区块间距，并只在该容器内清除直接子区块旧 margin；`file-index` / `everything` 的条件应放到包装节点，避免隐藏时形成空 flex item。
- `TuffMacOSTag` 保留 Apple 图标及现有组件 API，仅把默认本地化标签收敛为“仅限 / Only”；当前重复平台限定文案位于 `settings.setup.hideDockDesc`。

## Acceptance Criteria

- [x] 关闭高级设置时，“实用工具”不展示自动粘贴、自动清除、自动隐藏。
- [x] 开启高级设置时，上述三项按现有控件类型、选项和当前值正常展示及保存。
- [x] 关闭高级设置时，“通用配置”不展示不在 Dock 栏显示、静默启动、安装后自动装载 OmniPanel Feature。
- [x] 开启高级设置时，上述三项正常展示及保存；macOS 条件项仍只在 macOS 且系统能力可用时出现。
- [x] 新建或缺失对应配置时，不在 Dock 栏显示、静默启动、安装后自动装载 OmniPanel Feature 均为开启状态；已有显式 `false` 保持不变。
- [x] `beginner.init !== true` 时，配置默认值不得触发静默启动；完成引导后按用户配置生效，显式 secondary data、argv 和 login-item 静默信号仍保持原优先级。
- [x] 所有 `TuffMacOSTag` 展示为 Apple 图标加本地化“仅限 / Only”，描述文案不再重复平台限定。
- [x] 设置页所有相邻可见顶层区块（含“存储”入口）间距统一为 `12px`；隐藏条件区块不留下空白，折叠和展开时无粘连、重叠或异常跳动。
- [x] 相关设置页组件测试、类型检查和中英文 locale 校验通过。

## Out of Scope

- 重设计高级设置入口或新增独立高级设置页面。
- 修改自动粘贴、自动清除、自动隐藏等功能本身。
- 修改 Windows、Linux 平台标签样式或文案。
- 全局修改 `TuffGroupBlock` 在非设置页中的间距。
