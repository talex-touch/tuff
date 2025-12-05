# TODO 精简清单

聚焦代码内显式 TODO 以及 PRD 补档需求，按优先级列出。

## P0-P1 立即处理
- [x] 存储：`src/renderer/src/modules/hooks/usePromptManager.ts` 自定义提示词落地 TouchStorage，移除 console 占坑
- [x] 存储：`src/renderer/src/modules/division-box/store/division-box.ts` 固定列表改用 TouchStorage，告别 localStorage
- [ ] 下载中心：`useDownloadCenter.ts` 删除任务 API，`DownloadCenterView.vue` 优先级调整 API 接入，避免假动作

## 其他待办（按模块）
- 主进程/核心：`analytics/startup-analytics.ts` 上报实现；`extension-loader.ts` 卸载流程；`plugin-installer.ts` 安装校验升级；`plugin-log.service.ts` 日志格式化；`tray-menu-builder.ts` 接 CoreBox/Terminal；`search-core.ts` 性能与索引刷新；`file-provider.ts` 向量嵌入接入
- 渲染层：智能统计视图数据源落地（`IntelligenceCapabilities.vue`、`IntelligenceChannels.vue`、`IntelligencePrompts.vue`）；`modules/channel/plugin-core/index.ts` 补插件核心 API；Prompt 管理与分屏存储见上；下载中心见上
- 文档：PRD 中的搜索优化/AI Agent 相关条目只列标题，缺实现链接和进度标记，需要补全或下线
