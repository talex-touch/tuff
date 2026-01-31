# touch-snipaste

## 概览
- Snipaste 快捷控制插件（截图/贴图/取色）
- 启动时会自动生成 `settings.json`（若不存在）
- 支持自定义 Snipaste 命令动作

## 功能与内置动作
- 启动 Snipaste
- 截图（snip）
- 全屏截图到剪贴板（snip --full -o clipboard）
- 贴图（paste）
- 取色（pick-color）
- 显示/隐藏贴图（toggle-images）
- 打开帮助（docs）
- 生成默认配置（internal）
- 打开配置目录（internal）

## 配置方式
### Storage SDK（推荐）
- 在 CoreBox 中执行「打开配置目录」
- 编辑 `settings.json`
- 配置项：
  - `snipastePath`: Snipaste 可执行文件路径
  - `actions`: 自定义动作数组

### 环境变量（可选）
- `SNIPASTE_PATH`：优先级高于 `settings.json`

## 自定义动作示例
```json
{
  "snipastePath": "<Snipaste 可执行文件路径>",
  "actions": [
    {
      "id": "custom-snip",
      "title": "自定义截图",
      "subtitle": "snip --your-args",
      "args": ["snip", "--your-args"],
      "keywords": ["custom", "自定义"]
    }
  ]
}
```

## 备注
- Snipaste 需保持运行，命令行指令才会生效
- 自定义动作会与内置动作合并展示
