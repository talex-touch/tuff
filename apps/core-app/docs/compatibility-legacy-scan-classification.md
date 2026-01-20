# 兼容性/老旧代码命中分类（初版）

## 分类说明

- A：Deprecated/不推荐但仍在使用（明确 `@deprecated` / legacy 提示或弃用 API）
- B：兼容性/过渡性代码（fallback/shim/兼容旧协议、旧结构、迁移）
- C：其他老旧/风险项（非显式弃用但明显历史包袱或迁移残留）

## 分类清单

| 文件 | 分类 | 上下文说明 |
| --- | --- | --- |
| resources/db/migrations/0003_exotic_human_robot.sql | B | 迁移脚本，post-migration guard 处理重复列 |
| scripts/build-target.js | B | 构建版本号解析的 fallback 逻辑 |
| docs/compatibility-legacy-scan.md | C | 扫描规范文档（非运行时逻辑） |
| src/renderer/src/locales/zh-CN/download-migration.json | B | 迁移流程文案 |
| src/renderer/src/locales/en/download-migration.json | B | 迁移流程文案 |
| src/renderer/src/env.d.ts | B | vue-i18n Legacy 类型引用 |
| src/renderer/src/components/render/BoxGrid.vue | B | 网格布局 fallback 渲染 |
| src/renderer/src/components/download/IMPLEMENTATION_SUMMARY.md | B | 下载组件文档中提及 fallback |
| src/renderer/src/components/download/MigrationProgress.vue | B | 下载迁移进度 UI |
| src/renderer/src/components/tuff/template/TuffAsideList.vue | B | 组件渲染 id 兜底逻辑 |
| src/renderer/src/components/tuff/tags/TuffWindowsTag.vue | B | 标签渲染文案 fallback |
| src/renderer/src/components/tuff/tags/TuffBetaTag.vue | B | 标签渲染文案 fallback |
| src/renderer/src/components/tuff/tags/TuffLinuxTag.vue | B | 标签渲染文案 fallback |
| src/renderer/src/components/tuff/tags/TuffMacOSTag.vue | B | 标签渲染文案 fallback |
| src/renderer/src/components/permission/PermissionStatusCard.vue | A | Legacy SDK 警告 UI |
| src/renderer/src/components/base/input/FlatMarkdown.vue | B | 兼容类型问题的注释说明 |
| src/renderer/src/components/base/select/TSelectItem.vue | B | composedPath 兼容 legacy path |
| src/renderer/src/modules/install/install-manager.ts | B | 兼容旧索引字段与 fallback |
| src/renderer/src/modules/box/adapter/hooks/useClipboardChannel.ts | A | Clipboard 通道 deprecated 事件/方法 |
| src/renderer/src/modules/mousetrap-record.ts | B | Mousetrap 兼容性注释 |
| src/renderer/src/modules/layout/index.ts | B | Legacy export for backward compatibility |
| src/renderer/src/modules/storage/README.md | B | 迁移与 fallback 行为文档 |
| src/renderer/src/modules/storage/intelligence-storage.ts | B | Backward compatibility aliases |
| src/renderer/src/modules/lang/i18n.ts | B | legacy 模式与 locale fallback |
| src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md | B | i18n fallback 文档 |
| src/renderer/src/modules/tuffex/index.ts | B | 组件迁移阶段说明 |
| src/renderer/src/modules/hooks/core-box.ts | B | fallback 检查逻辑 |
| src/renderer/src/modules/hooks/dropper-resolver.ts | A | 旧插件格式弃用提示 |
| src/renderer/src/modules/market/providers/nexus-store-provider.ts | B | 兼容 legacy API 格式 |
| src/renderer/src/modules/market/providers/repository-provider.ts | B | git clone fallback |
| src/renderer/src/views/box/BoxInput.vue | B | placeholder fallback |
| src/renderer/src/views/box/tag/UnifiedFileTag.vue | B | icon fallback |
| src/renderer/src/views/box/tag/FileTag.vue | A | 旧 buffer 字段已 deprecated |
| src/renderer/src/views/box/tag/ClipboardFileTag.vue | B | icon fallback |
| src/renderer/src/views/base/settings/SettingFileIndex.vue | B | 数值解析兜底 |
| src/renderer/src/views/base/settings/SettingPermission.vue | A | legacy SDK 统计与警告 UI |
| src/renderer/src/views/base/styles/sub/ThemePreference.vue | B | theme fallback 检查 |
| src/renderer/src/views/base/application/AppList.vue | A | deprecated 排序逻辑注释 |
| src/main/core/main-window-state.ts | B | layout fallback 计算 |
| src/main/core/touch-window.ts | B | Windows fallback 渲染策略 |
| src/main/core/module-manager.ts | B | legacy filePath 兼容 |
| src/main/utils/version-util.ts | B | 版本号 fallback 逻辑 |
| src/main/utils/common-util.ts | B | 平台兼容性提示 |
| src/main/channel/common.ts | B | 失败场景 fallback 打开配置 |
| src/main/service/device-idle-service.ts | B | 参数 fallback clamp |
| src/main/modules/database/index.ts | B | 数据库迁移流程 |
| src/main/modules/flow-bus/module.ts | A | Deprecated 说明（破坏性变更） |
| src/main/modules/flow-bus/flow-bus.ts | B | fallback 复制流程 |
| src/main/modules/flow-bus/native-share.ts | B | 分享 fallback 行为 |
| src/main/modules/abstract-base-module.ts | B | 读取配置 fallback |
| src/main/modules/clipboard.ts | B | legacy macOS 格式与 fallback |
| src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts | B | fallback 推荐策略 |
| src/main/modules/box-tool/search-engine/search-gather.ts | B | legacy 搜索控制器 fallback |
| src/main/modules/box-tool/search-engine/search-core.ts | B | 搜索 fallback 路径 |
| src/main/modules/box-tool/search-engine/search-logger.ts | B | legacy setting fallback |
| src/main/modules/box-tool/addon/system/system-provider.ts | B | fallback 匹配逻辑 |
| src/main/modules/box-tool/addon/files/file-provider.ts | B | legacy 通道迁移说明 |
| src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts | B | API fallback |
| src/main/modules/box-tool/addon/apps/app-provider.ts | B | 数值 fallback clamp |
| src/main/modules/plugin/widget/widget-compiler.ts | A | legacy 接口与 deprecated compile |
| src/main/modules/plugin/plugin.ts | A | 多处 deprecated API 与 backward compatibility |
| src/main/modules/plugin/adapters/plugin-features-adapter.ts | B | fallback 文本匹配 |
| src/main/modules/plugin/plugin-loaders.ts | B | SDK 版本兼容/legacy fallback |
| src/main/modules/ocr/ocr-service.ts | B | fallback normalize |
| src/main/modules/tray/tray-icon-provider.ts | B | tray icon fallback |
| src/main/modules/storage/index.ts | B | legacy 通道迁移说明 |
| src/main/modules/storage/main-storage-registry.ts | B | normalize fallback |
| src/main/modules/system/permission-checker.ts | B | 旧系统权限 fallback |
| src/main/modules/tray-holder.ts | A | deprecated legacy tray holder |
| src/main/modules/download/migration-manager.test.ts | B | 迁移测试 |
| src/main/modules/download/migration-manager.ts | B | 迁移管理与 legacy 模块标记 |
| src/main/modules/download/network-monitor.ts | B | 多 URL fallback |
| src/main/modules/download/API.md | B | 迁移 API 文档 |
| src/main/modules/download/migrations.ts | B | 迁移工具 |
| src/main/modules/download/download-center.ts | B | 旧系统迁移入口 |
| src/main/modules/download/MIGRATION_GUIDE.md | B | 迁移指南 |
| src/main/modules/download/index.ts | B | 迁移导出 |
| src/main/modules/download/PERFORMANCE_OPTIMIZATIONS.md | B | 迁移相关性能记录 |
| src/main/modules/download/PERFORMANCE_QUICK_REFERENCE.md | B | 迁移相关速查 |
| src/main/modules/ai/provider-models.ts | B | 模型列表 fallback |
| src/main/modules/ai/agents/agent-manager.ts | B | fallback 执行路径 |
| src/main/modules/ai/intelligence-sdk.ts | B | provider fallback |
| src/main/modules/ai/tuff-intelligence-storage-adapter.ts | B | JSON 解析 fallback |
| src/main/modules/division-box/session.ts | A | @deprecated API |
| src/main/modules/permission/permission-store.ts | B | 迁移与兼容检查 |
| src/main/modules/permission/permission-guard.ts | B | legacy SDK 兼容路径 |
| src/main/modules/analytics/analytics-module.ts | B | 兼容旧事件处理 |
| src/main/modules/analytics/README.md | B | legacy 搜索说明 |
