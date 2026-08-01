# 删除版本历史功能

## Goal

从 CoreApp 中彻底移除“版本历史”浏览功能，同时保留升级后一次性展示的“本次更新”摘要与已读确认。

## Requirements

- 删除设置更新页中的版本历史入口与 UI。
- 删除版本历史组件、组件测试、深链查询参数和“查看完整日志”跳转。
- 删除远端版本日志列表/详情请求、离线缓存、typed transport 事件、SDK 方法和仅供历史浏览使用的公共类型。
- 删除版本历史专用中英文文案和自动组件声明。
- 精简内置 release-notes catalog，仅保留“本次更新”摘要所需字段。
- 保留 OTA 更新流程、内置更新摘要弹窗及其已读状态存储。
- 更新渠道选择对所有用户可见，稳定版为默认，Beta 明确标示预览风险。
- 用户切换渠道并保存成功后，立即按新渠道强制检查更新并刷新对应缓存。
- 更新生命周期不可检查时禁用渠道切换，避免与下载、安装或恢复流程冲突。

## Acceptance Criteria

- [x] 设置更新页不再渲染或引用版本历史组件。
- [x] 代码库中不存在 `ReleaseNotesHistory`、`listReleaseNotes`、`getReleaseNotes`、历史缓存文件逻辑或历史深链。
- [x] “本次更新”弹窗仍展示双语摘要，关闭后仍记录已读版本。
- [x] 普通用户可以选择 Release/Beta 渠道，Beta 风险和渠道行为有明确说明。
- [x] 渠道保存后立即检查新渠道，非 checkable 生命周期不能切换。
- [x] 相关 focused tests、CoreApp renderer/main typecheck 和 `git diff --check` 通过。

## Notes

- 历史数据库迁移文件属于已发布迁移记录，不回写或删除；当前已读状态表仍由“本次更新”弹窗使用。
- `notes/release-notes.config.json` 中的发布基线继续用于发布文档校验，不属于运行时版本历史功能。
- 平台参考：electron-builder channels/staged rollout、Sparkle 签名更新、Windows package flights、Apple TestFlight 均采用稳定默认、预览显式加入、分组/分阶段放量；CoreApp 本次仅调整桌面端渠道 UX，不新增 iOS 运行时。
- 验证：CoreApp 更新模块 22 个测试文件、146 条用例，Utils 2 个测试文件、44 条用例，catalog 1 个测试文件、2 条用例通过；合计 25 个文件、192 条用例。`typecheck:web`、`typecheck:node`、`lint:changed`、相关无缓存 scoped ESLint、locale JSON 解析和 `git diff --check` 均通过。
