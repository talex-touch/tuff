<div align="center">

  <img width="160" src="https://files.catbox.moe/2el8uf.png" alt="Tuff logo">

  <h1>Tuff</h1>

  > 指令中心，为创造者们而重塑。

  [![GitHub issues](https://img.shields.io/github/issues/talex-touch/tuff?style=flat-square)](https://github.com/talex-touch/tuff/issues)
  [![GitHub license](https://img.shields.io/github/license/talex-touch/tuff?style=flat-square)](https://github.com/talex-touch/tuff/blob/main/LICENSE)
  [![GitHub release](https://img.shields.io/badge/release-2.1.0-42B883?style=flat-square)](https://github.com/talex-touch/tuff/releases)
  [![GitHub release](https://img.shields.io/badge/dev-2.1.0-64391A?style=flat-square)](https://github.com/talex-touch/tuff/discussions/35)
  <br>
  [English](./README.md) | 简体中文
</div>

## 📌 公告

> 2.0.0 版本正在活跃开发和 Beta 测试中。

我们诚邀您下载预发布版本，fork 本项目并参与贡献。我们欢迎任何 `Pull Request` 和 `Issue`！

立即下载并向我们反馈！

## 🔷 项目简介

Tuff (原 TalexTouch) 是一个基于 Electron, TypeScript 和 Vue.js 构建的、本地优先、AI 原生、可无限扩展的桌面指令中心。它旨在成为您工作流的无缝延伸，帮助您更快地查找任何内容、执行任何指令。

## 🚀 背景

**我们相信，最强大的工具就应像您一样灵活多变。Tuff 是一种新型的指令中心——一个为您的操作系统打造的基础性、开源的层面，它被精心设计以预测您的意图，并与您独特的工作流无缝集成。其核心可被深度定制，设计上完全开放，随时准备好由您来塑造。**

## 🖇️ 跨平台支持

Tuff 目前支持 macOS。

> 即将支持 Windows 和 Linux。

## 🦋 精美的 UI 设计

Tuff 的设计风格受 TDesignS 启发，简洁而优雅。主题、字体和图标都经过精心调整，旨在为用户提供更好的体验。

### 前所未有的 UI 设计

![核心盒子](https://files.catbox.moe/a2tbvh.png)

![主页](https://files.catbox.moe/ig0ipw.png)

![插件](https://files.catbox.moe/8ltyn1.png)

![应用空状态](https://files.catbox.moe/ih8nj9.png)

![应用选择](https://files.catbox.moe/fh19zg.png)

### 绝佳的动画设计

> 部分动画在最新版本中已被移除。

#### 新版（非最新）

![新版主页](https://files.catbox.moe/3dylgz.gif)

#### 已过时

![简介动画](https://files.catbox.moe/e19hr1.gif)

![新版插件](https://files.catbox.moe/xksrfv.gif)

## 🗻 丰富的功能

Tuff 集成了多种实用功能，让您的桌面更智能、更高效。
- **核心工具:** 支持多窗口、快捷键、剪贴板管理、截图、计时器等。
- **AI 语义搜索:** 理解自然语言，用以查找文件、应用及操作。
- **情境感知智能:** 根据您当前使用的上下文，主动推荐相关指令。
- **可扩展性:** 支持通过“能力”(Capabilities) 插件来扩展其功能。
- **直接预览计算:** 搜索框里即时解析算式、单位、货币、时间与科学常量，结果一键复制。
- **连接你自己的大语言模型:** 允许您连接到私有云或任何自托管的大语言模型，实现极致的隐私与控制。

### 插件管理策略

- 官方市场下载的插件会在安装阶段自动关闭 manifest 中的 `dev` 入口，避免误连开发服务器。
- 每个插件的来源都会记录在数据库里，卸载时会连同插件目录与数据缓存一并清理。

## 🍀 简单易用的操作

Tuff 的操作非常简单直观，让用户可以轻松完成各种任务。您只需通过菜单或快捷键打开所需功能，即可享受 Tuff 带来的便利。

## 🔐 安全可靠

我们高度重视用户的安全和隐私。我们保证用户数据不会被泄露或滥用，并提供多重安全机制来保护用户的使用安全。

如果您正在寻找一款跨平台、设计精美且易于使用的桌面软件，Tuff 是您的不二之选。它不仅提供了丰富的功能，还拥有良好的用户体验和开放的社区生态。欢迎使用 Tuff，体验全新的桌面交互！

## 📚 文档

- **Docs Index**：`./docs/INDEX.md`
- **项目 PRD / Plans**：`./docs/plan-prd/README.md`
- **仓库 Docs**：`./docs/`
- **贡献指南**：`./.github/docs/contribution/CONTRIBUTING.md`
- **架构 / Agent 说明**：`./AGENTS.md`

## 🤝 开源协议

本项目基于 **MIT 许可证** 开源。

## ⁉️ 问题反馈

> 任何不符合 `issue 模板` 的问题将直接被关闭！

请知悉，开发者没有义务解决您提出的问题。本项目的开源和维护工作均基于开发者的业余时间。

## ❤️ 参与贡献

### 我们使用的技术

#### 🌀 前端

- Electron ^37.2.4
- Vue.js: ^3.5.18
- Vue Router: ^4.5.1
- Tuffex
- Milkdown: ^7.15.2
- Lottie-web: ^5.13.0

#### 💠 后端

- Node.js: >=22.0.0
- Koa: ^2.7.0

#### 🔧 构建工具

- Vite: ^7.0.6
- Electron Builder: ^25.1.8
- Sass: ^1.89.2

#### [点此查看](./.github/docs/contribution/CONTRIBUTING.md)

### 我们的贡献者

<!-- readme: collaborators,contributors -start -->
<table>
<tr>
    <td align="center">
        <a href="https://github.com/TalexDreamSoul">
            <img src="https://avatars.githubusercontent.com/u/59305952?v=4" width="100;" alt="TalexDreamSoul"/>
            <br />
            <sub><b>TalexDreamSoul</b></sub>
        </a>
    </td>
</tr>
</table>
<!-- readme: collaborators,contributors -end -->

## ✉️ 联系方式

通过电子邮件 (TalexDreamSoul@Gmail) 或提交 Issue。

Copyright © 2022-PRESENT TalexDreamSoul
