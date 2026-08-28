# 技术设计

## 边界

```text
CoreBox 输入/剪贴板
  -> typed Feature/Box/Clipboard SDK
  -> 插件 Surface / Prelude
  -> host permission + provider/clipboard service
  -> SQLite / Intelligence / platform shortcut
  -> 可见结果或稳定错误

插件源码 -> BETA .tpex -> publisher signature -> Nexus review/attestation
         -> production BETA catalog/download -> isolated CoreApp install -> UI smoke
```

- 插件只使用既有 typed SDK；Main 继续拥有剪贴板写入、AutoPaste、OCR、AI Provider 与权限检查。
- 主题由一个复用的插件主题同步工具归一化宿主 `themeStyle` 与系统自动模式，再同步 `html.dark`、`data-theme` 和 `color-scheme`。不把 localStorage 作为宿主主题事实源。
- JSON Formatter 在 mount 时读取 `box.getInput()`，随后订阅 Feature 输入；用请求/生命周期边界避免卸载后写入。
- Clipboard History 保留现有 debounce + generation 方案；OCR 验收使用真实图片写入和宿主 System OCR，不造测试元数据。
- Translation 使用 Prelude 的 host Translation service。隔离 profile 的 Provider 配置只通过 CoreApp 已有安全导入/设置路径进入，Key 不进入插件 storage、日志或录屏。

## AutoPaste 与安装确认

- AutoPaste：`Clipboard SDK -> clipboard.write permission -> ClipboardAutopasteAutomation -> hide CoreBox -> delay -> sendPlatformShortcut('paste')`。系统 Automation 拒绝必须映射为稳定错误并保留剪贴板回退。
- 安装：生产 Nexus 官方标记由 Main 从下载元数据验证；官方来源不显示来源风险确认。声明权限由安装队列统一权限卡一次完成，后续启用不得重复弹同一缺失权限请求。

## 版本与发布

| 插件 | 基线 | BETA |
|---|---:|---:|
| JSON Formatter | 1.0.8 | 1.0.9-beta.4 |
| Clipboard History | 1.1.12 | 1.1.13-beta.2 |
| touch-translation | 1.0.17 | 1.0.18-beta.4 |

- package.json 与 manifest.json 同步。
- 发布通道固定 `BETA`；保留 manifest id、Nexus slug 与现有 owner。
- 每个 artifact 记录 SHA-256；审核后验证 policy/scan/admission/attestation，再通过生产下载端点取回并比对字节。

## 验收与录屏

- 使用当前 beta CoreApp 的隔离 profile，不读取或覆盖真实用户插件目录。
- 每个插件一个 ffmpeg/AVFoundation 录屏，开始画面证明未安装，结束画面证明功能和主题；敏感输入不入画。
- Light/Dark 通过宿主主题切换后重新打开或实时同步插件 Surface，像素与 DOM/可访问状态双重检查。

## 回滚

- 代码回滚仅撤销本任务文件。
- Nexus BETA 不覆盖 RELEASE；失败版本保持 pending/rejected，不提升 latest eligible。
- 隔离 profile 与录屏临时文件独立，失败不污染真实 profile。
