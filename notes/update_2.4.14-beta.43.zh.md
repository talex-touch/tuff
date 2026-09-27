# Tuff v2.4.14-beta.43 更新说明

## 摘要

- 端侧语音模型「装上即可用」：安装或移除模型后即时重算 `audio.asr` 路由，不再需要重启或手动去渠道页绑定；已有云端通道也不再让「本地」来源报「不可用」。
- 模型安装不再假失败：下载按自身量级给期限（先引擎运行时、后 228 MB 权重），不会再在主进程已经装完之后报 60 秒超时。
- 插件包下载恢复：手动跟随重定向改走 `net.request`（Chromium 的 fetch 会直接取消 manual 跳转），下载期限随包体积缩放，14 MB 的包不再固定 30 秒就中断。
- CoreBox 与 Home 继续收口：默认全局快捷键改为 Option+Space，条目转场与 meta 浮层重做，输入区发送岛动效与听写集成落地，侧栏动作语义化并带删除确认。
- 本地文件与图标：折叠 macOS `/private` 别名修好插件图标 403，图标读取失败时给出真实原因而不是 `TypeError`。

## 变更内容

- 语音路由：`ensureLocalAsrRoute` 改为跟着模型库走——安装与卸载后各重算一次；别的通道占用 `audio.asr` 时也照常绑定端侧通道（`云端` 来源仍只解析云通道）；模型库为空时释放绑定，且仍然尊重用户在渠道页的关闭动作。
- 语音模型安装：安装请求带上 30 分钟上限，进度轮询仍是存活信号，通道的 60 秒默认期限不再把已经完成的安装报成失败。
- 插件下载：手动模式的跳转改由 `net.request({ redirect: 'manual' })` 获取，302 不再被 Chromium 直接取消；响应体经 `PassThrough` 带背压桥接给 `pipeline` 消费方，响应头统一为小写。
- 下载期限：`resolvePackageDownloadTimeout` 以 30 秒为下限、50 KiB/s 悲观吞吐缩放、10 分钟为上限；npm 取 `dist.unpackedSize`，TPEX 取详情里的 `packageSize`。
- 本地文件策略：比较前折叠 macOS `/private` 前缀，插件自己的 `assets` 图标不再被判成越界（tfile 403 / `NETWORK_FILE_FORBIDDEN`）；路径遍历与旁路路径仍被拒绝。
- 渲染层错误：图标读取拿到非字符串负载时抛出带原因的 `Icon content request failed: …`，不再用 `text.trim is not a function` 掩盖真实失败。
- CoreBox：默认全局快捷键切换为 Option+Space 并补快捷键提示；条目转场、脉冲光束条与渲染细节打磨；meta 浮层居中、背景模糊与操作项重做；新增快速通道（内存内应用搜索、刷新风暴保护、跳转导航）。
- CoreBox 工具：新增 radix 换算与行工具、中文与天文单位词条、八个物理常数（支持符号查找），并修正只在查询首尾命中文本统计的问题。
- Home 与会话：输入区控件重做、发送岛动效与听写集成；AI 开场白默认关闭、可按需开启；空白会话给出问候与建议；推理强度可传到实际运行的模型；图片可从页面任意位置粘贴进输入框；能力提示不再被保存成能力 ID。
- 侧栏：动作按钮写明各自做什么，并对删除做确认；项目改为文件夹形态并高亮当前项目。
- 索引与搜索：文件索引的内存边界、worker 背压与图标存储收敛。
- TuffEx：新增 `TxChoiceCard`（分页富选项卡片）与 `TxFusionSurface`（路径绘制、可生长可分裂的表面），波浪指示器引擎与多处视觉细节；`TxPrismGlow` 浅色模式不再发灰。
- Nexus 与文档：边缘模糊布局、组件画廊与文档规格打磨；自闭合文档组件在 MDC 解析前正确闭合；Cloudflare AI Gateway 的取舍已记录成文。
- 商店与插件提示：提示按钮改用本地化的 `common.confirm`，中文界面不再出现英文 “Sure”。
- 主进程与工程：system shell 处理器、precore、托盘与 i18n 整理，并补齐打包验收门禁；分支与发布策略可执行化（`check branch-policy` 与 CI 门禁、beta 通道包含性判定）；pin 检查器入口经 realpath 解析；radix 模式查找对 undefined 做防护。
- 任务记录：新增 channel 错误回复契约任务（错误回复仍被当作数据 resolve，R1 待修），已修的 macOS 别名问题作为证据保留。
