# touch-snipaste

## 概览

Snipaste 快捷控制插件，支持截图、贴图、取色和帮助等固定动作。Prelude 在独立 utility process 中运行，所有进程操作都通过 main 签发的 `process.spawn` capability 完成。

## 内置动作

- 启动 Snipaste
- 截图
- 全屏截图到剪贴板
- 贴图
- 取色
- 显示/隐藏贴图
- 打开帮助

## 安全边界

- child 只能提交固定 `{ operation: 'snipaste-action', actionId }` 请求。
- Snipaste 可执行文件仅由 main 在受信任的系统位置和当前用户 `Applications` 目录中发现。
- child 不能提供可执行文件、路径、参数、环境变量、工作目录、shell 或平台。
- `system.shell` 在每次调用时鉴权；permission revoke、取消、超时和 activation teardown 都会终止 activation 持有的进程并等待真实退出。
- 返回值只包含稳定状态和 reason，不包含可执行文件路径或原生错误。

## 兼容性变更

旧版 `SNIPASTE_PATH`、`settings.json.snipastePath` 和 `settings.json.actions` 自定义可执行文件/参数行为不满足隔离边界，已移除且不会自动迁移。原有七个内置用户工作流保持不变；Snipaste 需要安装在宿主认可的固定位置。
