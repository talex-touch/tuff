# 自动化控制

## CoreBox 指令
| 命令 | 功能 |
| --- | --- |
| `open <app>` | 打开应用或 Workspace |
| `run <workflow>` | 触发指定 Workflow |
| `set focus` | 进入聚焦模式 |
| `diagnose` | 导出系统诊断 |
| `record macro` | 录制快捷脚本 |

## 快捷键策略
- `⌘ + E`：唤起 CoreBox。
- `⌘ + Shift + K`：打开 Workflow Studio。
- `⌘ + Shift + Space`：呼出浮动 Widget 面板。
- `⌘ + Shift + M`：启用/退出聚焦模式。
- 所有快捷键可在设置中针对 Workspace 重新映射。

## 剪贴板增强
- Clipbox 可自动检测文本、图片、文件并触发相应 Workflow。
- 使用「规则」功能对特定格式（如 Markdown、代码片段）执行自动清理。
- 勾选「跨设备剪贴板」即可与移动端保持同步。

## 自动化闭环
1. 触发：快捷键或剪贴板事件。
2. 处理：调用 Workflow / 插件脚本。
3. 呈现：Widget、通知或直接写入目标应用。
4. 复盘：使用 `automation log` 查看执行路径。

## 建议
- 先定义动作，再回推触发器，确保每个 workflow 有明确产出。
- 对高权限命令启用 Touch ID/Windows Hello 认证。
