# touch-snipaste

Snipaste 快捷控制插件，支持从 CoreBox 快速执行截图、贴图、取色和帮助等固定动作。Prelude 在隔离的 utility process 中运行，所有进程调用均通过宿主签发的受治理 `plugin.snipaste.runAction` 能力完成。

## 内置动作

- **启动 Snipaste** (`launch`)
- **截图** (`snip`)
- **全屏截图到剪贴板** (`snip-full`)
- **贴图** (`paste`)
- **取色** (`pick-color`)
- **显示/隐藏贴图** (`toggle-images`)
- **打开帮助** (`docs`)

## 权限与安全边界

- 需要 `search.root-results` 与 `system.shell` 权限，每次调用均由宿主鉴权。
- Prelude 仅提交固定白名单 `actionId`，不传递自定义可执行路径、命令行参数、环境变量或工作目录。
- Snipaste 可执行文件由主进程仅在受信任系统路径及当前用户 `Applications` 目录中发现。
- 权限撤销、取消、超时或插件停用均会终止宿主关联进程；错误返回值经过脱敏，仅返回稳定状态与规范 `reason`，不暴露本地路径或原生错误详情。

## 兼容性说明

旧版自定义可执行路径与自定义动作配置不满足隔离边界，已移除且不会自动迁移；请将 Snipaste 安装在系统默认应用目录中。

## 开发验证

```bash
pnpm -C plugins/touch-snipaste test
```
