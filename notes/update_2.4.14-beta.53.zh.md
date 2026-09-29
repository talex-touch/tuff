# Tuff v2.4.14-beta.53 更新说明

## 摘要

- AI 提供方能力收敛到 Provider Registry 与 Scene，移除旧提供方表和重复配置入口。
- Nexus 管理台重组导航并全面使用 TuffEx 重构分析看板，信息密度和操作层级更一致。
- TuffEx 升级至 0.6.2，新增机器人头像、图像生成揭示、液态金属与语音响应光束组件。
- 建立 165 个 TuffEx 组件的生命周期账本、双语变更历程和自动发布门禁。
- 修复新披露的 fast-uri 高危依赖，并提高 Nexus 生产构建的内存余量。

## 变更内容

- Provider Registry 与 Scene 成为 AI 运行时唯一权威，核心应用同步移除旧 intelligence provider 配置界面和迁移分支。
- Nexus 管理台收敛为五个导航分组，顶栏缩至 44px，分析、内容、用户、AI 与系统治理入口更清晰。
- 九个分析面板迁移至 TxCard、TxProgressBar、TxStatusBadge、TxEmptyState 等统一组件，并修正路由与空状态。
- TuffEx 0.6.2 新增 TxBotAvatar、TxImageGeneration、TxMetalFx 与 TxVoiceBeam，同时增强多段进度条和后台容器。
- 为全部 165 个导出组件记录准确的 Since 版本，新增中英文组件变更历程，版本升级缺项会被 CI 和发布流程阻断。
- 将 fast-uri 固定到 3.1.7，消除两个新披露的高危告警并删除已失效的临时允许项。
- Nexus 生产构建堆上限由 8 GiB 调整为 12 GiB，避免完整文档与管理台构建在打包后段耗尽内存。
