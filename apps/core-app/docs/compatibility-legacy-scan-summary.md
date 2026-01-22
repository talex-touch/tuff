# 兼容性/老旧代码分类清单（汇总）

风险等级说明：low（影响有限/可控）、medium（可能影响兼容或数据）、high（可能引发破坏性行为）。

## A. Deprecated/不推荐但仍在使用

- src/renderer/src/components/permission/PermissionStatusCard.vue; src/renderer/src/views/base/settings/SettingPermission.vue — trigger: legacy SDK 插件提示/统计; alternative: 升级插件 SDK; risk: low
- src/main/modules/plugin/plugin.ts — trigger: deprecated Plugin API（clearItems/pushItems/getItems 等）被调用; alternative: plugin.feature API; risk: medium
- src/main/modules/tray-holder.ts — trigger: legacy tray holder 模块使用; alternative: TrayManager; risk: medium

## B. 兼容性/过渡性代码

- resources/db/migrations/0003_exotic_human_robot.sql — trigger: 数据库迁移执行; alternative: 保持 schema 最新; risk: medium
- scripts/build-target.js — trigger: 版本号解析失败时 fallback; alternative: 统一版本格式; risk: low
- src/renderer/components.d.ts — trigger: 类型声明包含 Migration/Compatibility 组件名; alternative: 无需处理; risk: low
- src/renderer/src/composables/market/useVersionCompare.ts — trigger: semver-compatible 版本比较; alternative: 统一 semver 库; risk: low
- src/renderer/src/locales/zh-CN/download-migration.json — trigger: 下载迁移流程展示; alternative: 迁移完成后提示; risk: low
- src/renderer/src/locales/en/download-migration.json — trigger: 下载迁移流程展示; alternative: 迁移完成后提示; risk: low
- src/renderer/src/env.d.ts — trigger: 使用 vue-i18n legacy 类型; alternative: 新 API 类型; risk: low
- src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue — trigger: 模型分组 fallback key/label; alternative: 统一 provider 前缀; risk: low
- src/renderer/src/components/render/sourceMeta.ts — trigger: source label fallback; alternative: 补齐 source 名称; risk: low
- src/renderer/src/components/render/BoxGrid.vue — trigger: 无分组时 fallback 渲染; alternative: 结构化 sections; risk: low
- src/renderer/src/components/download/IMPLEMENTATION_SUMMARY.md — trigger: 文档引用 fallback 方案; alternative: 统一来源; risk: low
- src/renderer/src/components/download/MigrationProgress.vue — trigger: 迁移进度流程运行; alternative: 迁移完成后移除; risk: medium
- src/renderer/src/components/tuff/template/TuffAsideList.vue — trigger: item id 缺失时 fallback; alternative: 补齐 id; risk: low
- src/renderer/src/components/tuff/tags/TuffWindowsTag.vue — trigger: label 缺失时 fallback; alternative: 补齐配置; risk: low
- src/renderer/src/components/tuff/tags/TuffBetaTag.vue — trigger: label 缺失时 fallback; alternative: 补齐配置; risk: low
- src/renderer/src/components/tuff/tags/TuffLinuxTag.vue — trigger: label 缺失时 fallback; alternative: 补齐配置; risk: low
- src/renderer/src/components/tuff/tags/TuffMacOSTag.vue — trigger: label 缺失时 fallback; alternative: 补齐配置; risk: low
- src/renderer/src/components/base/input/FlatMarkdown.vue — trigger: 类型兼容问题注释; alternative: 升级类型定义; risk: low
- src/renderer/src/components/base/dialog/PlatformCompatibilityWarning.vue — trigger: 平台兼容提示 UI; alternative: 统一平台能力; risk: low
- src/renderer/src/components/base/select/TSelectItem.vue — trigger: composedPath 缺失时 fallback legacy path; alternative: 统一标准 API; risk: low
- src/renderer/src/modules/install/install-manager.ts — trigger: 旧索引结构兼容; alternative: 统一 providerId::pluginId 结构; risk: medium
- src/renderer/src/modules/box/adapter/hooks/useResize.ts — trigger: legacy element wrap fallback; alternative: 统一结构; risk: low
- src/renderer/src/modules/mousetrap-record.ts — trigger: Mousetrap 兼容注释; alternative: 升级依赖; risk: low
- src/renderer/src/modules/layout/index.ts — trigger: legacy export 兼容; alternative: 使用新导出; risk: low
- src/renderer/src/modules/layout/useSecondaryNavigation.ts — trigger: parent route fallback; alternative: 保证 route record; risk: low
- src/renderer/src/modules/storage/README.md — trigger: 迁移文档指引; alternative: 完成迁移后清理; risk: low
- src/renderer/src/modules/storage/intelligence-storage.ts — trigger: backward compatibility aliases; alternative: 统一新结构; risk: medium
- src/renderer/src/modules/lang/i18n.ts — trigger: legacy 模式/locale fallback; alternative: 新 i18n 流程; risk: low
- src/renderer/src/modules/lang/zh-CN.json — trigger: 兼容/compatible 文案; alternative: 文案整理; risk: low
- src/renderer/src/modules/lang/en-US.json — trigger: compatible 文案; alternative: 文案整理; risk: low
- src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md — trigger: fallback 说明文档; alternative: 更新文档; risk: low
- src/renderer/src/modules/tuffex/index.ts — trigger: 组件迁移阶段说明; alternative: 完成迁移; risk: low
- src/renderer/src/modules/hooks/core-box.ts — trigger: 参数映射 fallback; alternative: 统一参数格式; risk: low
- src/renderer/src/modules/hooks/useAppLifecycle.ts — trigger: 平台兼容提示触发; alternative: 统一平台能力; risk: low
- src/renderer/src/modules/hooks/useSvgContent.ts — trigger: fallback URL 解析; alternative: 统一资源协议; risk: low
- src/renderer/src/modules/mention/platform-warning.ts — trigger: 平台兼容提示组件引用; alternative: 统一提示入口; risk: low
- src/renderer/src/modules/market/providers/nexus-store-provider.ts — trigger: legacy API 格式兼容; alternative: 统一新 API; risk: medium
- src/renderer/src/modules/market/providers/repository-provider.ts — trigger: clone fallback; alternative: 统一拉取策略; risk: low
- src/renderer/src/views/box/BoxInput.vue — trigger: placeholder fallback; alternative: 配置默认值; risk: low
- src/renderer/src/views/box/tag/UnifiedFileTag.vue — trigger: icon fallback; alternative: 提供 icon; risk: low
- src/renderer/src/views/box/tag/FileTag.vue — trigger: path 缺失时 fallback; alternative: 补齐路径; risk: low
- src/renderer/src/views/box/tag/ClipboardFileTag.vue — trigger: icon fallback; alternative: 提供 icon; risk: low
- src/renderer/src/views/base/settings/SettingFileIndex.vue — trigger: 数值解析 fallback; alternative: 输入校验; risk: low
- src/renderer/src/views/base/styles/sub/ThemePreference.vue — trigger: theme key 缺失 fallback; alternative: 补齐配置; risk: low
- src/renderer/src/views/base/styles/LayoutSection.vue — trigger: layout label fallback; alternative: 补齐文案; risk: low
- src/renderer/src/assets/docs/license.md — trigger: license 文案包含 compatible; alternative: 无; risk: low
- src/main/core/main-window-state.ts — trigger: layout 不匹配时 fallback; alternative: 更新 layout signature; risk: low
- src/main/core/touch-window.ts — trigger: Mica/Vibrancy fallback; alternative: 保持平台能力一致; risk: low
- src/main/core/module-manager.ts — trigger: legacy filePath 兼容; alternative: 使用新字段; risk: medium
- src/main/utils/version-util.ts — trigger: 版本解析 fallback; alternative: 统一版本格式; risk: low
- src/main/utils/common-util.ts — trigger: 平台兼容提示/分支; alternative: 统一平台能力; risk: low
- src/main/channel/common.ts — trigger: 路径解析 fallback; alternative: 统一路径格式; risk: low
- src/main/service/device-idle-service.ts — trigger: 参数 clamp fallback; alternative: 输入校验; risk: low
- src/main/modules/database/index.ts — trigger: DB 迁移流程; alternative: 完成迁移后移除; risk: medium
- src/main/modules/flow-bus/flow-bus.ts — trigger: fallback copy; alternative: 主路径可用; risk: low
- src/main/modules/flow-bus/native-share.ts — trigger: 分享 fallback; alternative: 主平台 API 可用; risk: low
- src/main/modules/abstract-base-module.ts — trigger: 配置读取 fallback; alternative: 补齐配置; risk: low
- src/main/modules/clipboard.ts — trigger: legacy macOS clipboard 格式兼容; alternative: 新格式; risk: medium
- src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts — trigger: fallback 推荐策略; alternative: 主策略可用; risk: low
- src/main/modules/box-tool/search-engine/search-gather.ts — trigger: legacy 搜索模式; alternative: layered search; risk: medium
- src/main/modules/box-tool/search-engine/search-core.ts — trigger: 搜索 fallback 路径; alternative: 主队列可用; risk: medium
- src/main/modules/box-tool/search-engine/search-logger.ts — trigger: legacy setting fallback; alternative: 新配置项; risk: low
- src/main/modules/box-tool/core-box/window.ts — trigger: Electron 输入兼容说明; alternative: 统一事件映射; risk: low
- src/main/modules/box-tool/addon/system/system-provider.ts — trigger: 字符匹配 fallback; alternative: 精准匹配; risk: low
- src/main/modules/box-tool/addon/files/file-provider.ts — trigger: legacy 通道迁移说明/平台分支; alternative: transport 通道; risk: medium
- src/main/modules/box-tool/addon/files/everything-provider.ts — trigger: compatible mapping 说明; alternative: 统一 map 输出; risk: low
- src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts — trigger: 备用 API fallback; alternative: 主 API 可用; risk: low
- src/main/modules/box-tool/addon/apps/app-provider.ts — trigger: 数值 fallback clamp; alternative: 输入校验; risk: low
- src/main/modules/box-tool/addon/apps/search-processing-service.ts — trigger: 高亮 fallback; alternative: 补齐 raw highlights; risk: low
- src/main/modules/plugin/providers/utils.ts — trigger: 扩展名 fallback; alternative: 统一后缀解析; risk: low
- src/main/modules/plugin/adapters/plugin-features-adapter.ts — trigger: fallback 文本匹配; alternative: 结构化匹配; risk: low
- src/main/modules/plugin/plugin-loaders.ts — trigger: SDK 版本兼容/legacy fallback; alternative: 升级 sdkapi; risk: medium
- src/main/modules/ocr/ocr-service.ts — trigger: 解析 fallback; alternative: 统一输入; risk: low
- src/main/modules/tray/tray-icon-provider.ts — trigger: tray icon fallback; alternative: 统一资源; risk: low
- src/main/modules/storage/index.ts — trigger: legacy 通道迁移说明; alternative: transport 通道; risk: medium
- src/main/modules/storage/main-storage-registry.ts — trigger: normalize fallback; alternative: 输入校验; risk: low
- src/main/modules/system/permission-checker.ts — trigger: 旧系统权限 fallback; alternative: 新权限检查; risk: medium
- src/main/modules/download/migration-manager.test.ts — trigger: 迁移测试运行; alternative: 保持测试通过; risk: low
- src/main/modules/download/migration-manager.ts — trigger: 下载中心迁移执行; alternative: 迁移完成后降级; risk: medium
- src/main/modules/download/network-monitor.ts — trigger: 多 URL fallback; alternative: 主 URL 可用; risk: low
- src/main/modules/download/API.md — trigger: 迁移 API 文档; alternative: 完成迁移后更新文档; risk: low
- src/main/modules/download/migrations.ts — trigger: 迁移流程执行; alternative: 迁移完成后移除; risk: medium
- src/main/modules/download/download-center.ts — trigger: 旧系统迁移入口; alternative: 新流程; risk: medium
- src/main/modules/download/MIGRATION_GUIDE.md — trigger: 迁移指南引用; alternative: 完成迁移后更新; risk: low
- src/main/modules/download/index.ts — trigger: 迁移导出; alternative: 迁移完成后更新; risk: low
- src/main/modules/download/PERFORMANCE_OPTIMIZATIONS.md — trigger: 迁移相关记录; alternative: 更新文档; risk: low
- src/main/modules/download/PERFORMANCE_QUICK_REFERENCE.md — trigger: 迁移相关记录; alternative: 更新文档; risk: low
- src/main/modules/ai/intelligence-strategy-manager.ts — trigger: fallback providers; alternative: 主 provider 可用; risk: low
- src/main/modules/ai/provider-models.ts — trigger: 模型列表 fallback; alternative: 主 API 返回; risk: low
- src/main/modules/ai/runtime/base-provider.ts — trigger: incompatible 模型校验; alternative: 统一模型规范; risk: low
- src/main/modules/ai/agents/agent-manager.ts — trigger: fallback 执行路径; alternative: 主执行路径; risk: low
- src/main/modules/ai/intelligence-module.ts — trigger: OpenAI-compatible provider; alternative: 统一 provider 接口; risk: low
- src/main/modules/ai/intelligence-sdk.ts — trigger: provider fallback; alternative: 主 provider; risk: medium
- src/main/modules/ai/tuff-intelligence-storage-adapter.ts — trigger: JSON 解析 fallback; alternative: 统一数据格式; risk: low
- src/main/modules/division-box/flow-trigger.ts — trigger: forward-compatible 注释; alternative: 统一 flow 入口; risk: low
- src/main/modules/permission/permission-store.ts — trigger: 权限迁移/compat 检查; alternative: 新权限模型; risk: medium
- src/main/modules/permission/permission-guard.ts — trigger: legacy SDK 兼容路径; alternative: 强制新 SDK; risk: medium
- src/main/modules/permission/channel-guard.ts — trigger: allowLegacy 分支; alternative: 配置化开关; risk: low
- src/main/modules/analytics/analytics-module.ts — trigger: 兼容旧事件处理; alternative: 新事件格式; risk: low
- src/main/modules/analytics/README.md — trigger: legacy 搜索说明; alternative: 更新文档; risk: low

### 隐性兼容补充（未被关键词命中）

- src/renderer/src/components/render/CoreBoxFooter.vue — trigger: platform 分支 UI; alternative: 统一交互逻辑; risk: low
- src/renderer/src/components/render/ActionPanel.vue — trigger: platform 分支 UI; alternative: 统一交互逻辑; risk: low
- src/renderer/src/components/base/input/FlatKeyInput.vue — trigger: platform 分支按键处理; alternative: 统一事件映射; risk: low
- src/renderer/src/views/box/DivisionBoxHeader.vue — trigger: platform 分支渲染; alternative: 统一渲染逻辑; risk: low
- src/renderer/src/views/base/settings/SettingSetup.vue — trigger: platform 条件展示; alternative: 统一配置; risk: low
- src/main/core/precore.ts — trigger: platform 分支初始化; alternative: 平台适配层; risk: low
- src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts — trigger: platform 分支监听; alternative: 统一 watcher; risk: medium
- src/main/modules/box-tool/addon/app-addon.ts — trigger: 按平台动态加载模块; alternative: 抽象 provider; risk: medium
- src/main/modules/box-tool/addon/apps/app-scanner.ts — trigger: 平台专属路径/扫描; alternative: 统一扫描层; risk: medium
- src/main/modules/tray/tray-manager.ts — trigger: platform 分支 tray; alternative: 统一资源与流程; risk: medium
- src/main/modules/terminal/terminal.manager.ts — trigger: platform 分支终端; alternative: 统一 shell 选择; risk: low
- src/main/modules/build-verification/index.ts — trigger: platform 识别/校验; alternative: 统一构建校验; risk: low
- src/renderer/src/modules/update/UpdateProvider.ts — trigger: 版本比较/平台识别; alternative: 统一 update provider; risk: medium
- src/main/modules/update/update-system.ts — trigger: 版本比较门控; alternative: 统一 semver; risk: medium
- src/renderer/src/modules/auth/auth-env.ts — trigger: DEV 环境开关; alternative: 配置化 feature flag; risk: low
- src/renderer/src/modules/devtools/app-entrance-log.ts — trigger: DEV 环境开关; alternative: 配置化开关; risk: low
- src/main/service/plugin-market.service.ts — trigger: NODE_ENV 分支; alternative: 配置化开关; risk: low
- src/main/utils/logger.ts — trigger: NODE_ENV 分支; alternative: 统一日志配置; risk: low

## C. 其他老旧/风险项

- docs/compatibility-legacy-scan.md — trigger: 扫描规范文档引用; alternative: 更新规范; risk: low
