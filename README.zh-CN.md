<div align="center">

  <img width="160" src="https://files.catbox.moe/2el8uf.png" alt="Tuff logo">

  <h1>Tuff</h1>

  <p><b>指令中心，为创造者们而重塑。</b></p>

  [![Release](https://img.shields.io/github/v/release/talex-touch/tuff?include_prereleases&style=flat-square)](https://github.com/talex-touch/tuff/releases)
  [![Downloads](https://img.shields.io/github/downloads/talex-touch/tuff/total?style=flat-square)](https://github.com/talex-touch/tuff/releases)
  [![Issues](https://img.shields.io/github/issues/talex-touch/tuff?style=flat-square)](https://github.com/talex-touch/tuff/issues)
  [![License](https://img.shields.io/github/license/talex-touch/tuff?style=flat-square)](./LICENSE)
  [![Linux.do](https://img.shields.io/badge/Linux.do-Community-f0b400?style=flat-square)](https://linux.do)

  [官网](https://tuff.tagzxia.com) · [下载](https://github.com/talex-touch/tuff/releases) · [文档](https://tuff.tagzxia.com/docs) · [插件商店](https://tuff.tagzxia.com/store)

  [English](./README.md) | 简体中文

</div>

![Tuff CoreBox on macOS](./docs/assets/corebox-hero.jpg)

## 🔷 项目简介

Tuff (原 TalexTouch) 是一个基于 Electron、TypeScript 和 Vue.js 构建的、本地优先、AI 原生、可无限扩展的桌面指令中心。它旨在成为您工作流的无缝延伸，帮助您更快地查找任何内容、执行任何指令。

在任意界面按下 <kbd>⌘</kbd> <kbd>E</kbd>（Windows 与 Linux 为 <kbd>Ctrl</kbd> <kbd>E</kbd>）即可唤起 CoreBox。

## ⬇️ 下载

三端预构建安装包统一发布在 [Releases 页面](https://github.com/talex-touch/tuff/releases)。

| 平台 | 安装包 |
| --- | --- |
| macOS | `.dmg` / `.zip`，支持 Apple Silicon 与 Intel |
| Windows | `.exe` 安装器（x64） |
| Linux | `.deb`（推荐） / `.AppImage` |

Ubuntu 24.04 及以上请安装 `.deb` 而不是 AppImage。24.04 默认限制非特权用户命名空间，而 Electron 的沙箱需要它；`.deb` 会在安装时注册一份授予 `userns` 的 AppArmor 配置，AppImage 没有安装步骤，无处注册。若必须使用 AppImage，可用 `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` 临时放开。相关追踪见 [#213](https://github.com/talex-touch/tuff/issues/213)，该 issue 仍在等待一份说明「用的是两者中哪一个」的复测报告。

## 📌 发布与平台状态

最新稳定版与当前预发布版本均以 [GitHub Releases](https://github.com/talex-touch/tuff/releases) 为准；开发中版本以[根目录 package manifest](./package.json) 与 [CoreApp package manifest](./apps/core-app/package.json) 的声明为准。README 中刻意不再重复具体版本号，以免与实际版本脱节。

`2.4.14` 的公开发布门槛是刻意严格的：macOS、Windows、Linux 三端都必须提供真实安装、N→N+1 升级、启动健康与恢复的验收证据后才能发布。首批公开范围只包含稳定的启动/搜索能力与逐个验证过的官方插件；AI 与未完成的 UI 界面明确标注为 Beta 或暂不可用。详见[当前稳定化计划](./docs/plan-prd/TODO.md)与[跨平台审计](./.trellis/tasks/07-13-search-crossplatform-audit/prd.md)。

稳定的源码版本不代表三端能力成熟度一致：各平台的能力与降级边界，以该平台自身的验收证据为准。

## 🚀 背景

**我们相信，最强大的工具就应像您一样灵活多变。Tuff 是一种新型的指令中心——一个为您的操作系统打造的基础性、开源的层面，它被精心设计以预测您的意图，并与您独特的工作流无缝集成。其核心可被深度定制，设计上完全开放，随时准备好由您来塑造。**

## 🗻 功能特性

- **全局搜索** —— 应用、文件、插件动作、计算、单位、货币与时间，全部在 CoreBox 中完成。
- **AI 语义搜索** —— 用自然语言查找文件、应用与操作。
- **情境感知智能** —— 根据您当前使用的上下文，主动推荐相关指令。
- **直接预览计算** —— 算式、单位、货币、时间与科学常量即时渲染为可一键复制的结果卡片。
- **可扩展性** —— 通过受权限约束的插件（“能力” / Capabilities）与类型化 SDK 扩展宿主。
- **连接你自己的大语言模型** —— 私有云、托管服务商或任意自托管模型都可接入。
- **核心工具** —— 多窗口、快捷键、剪贴板管理、截图、计时器等。
- **统一下载中心** —— 集中管理下载进度与断点续传。
- **宿主掌控的边界** —— 剪贴板、截图、工作流、下载与自动化能力均在权限网关之后运行。

### 插件管理策略

- 官方市场下载的插件会在安装阶段自动关闭 manifest 中的 `dev` 入口，避免误连开发服务器。
- 每个插件的来源都会记录在数据库里，卸载时会连同插件目录与数据缓存一并清理。

## 🦋 精美的 UI 设计

Tuff 的设计风格受 TDesignS 启发，简洁而优雅。主题、字体和图标都经过精心调整，旨在为用户提供更好的体验。

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

## 🍀 简单易用的操作

Tuff 的操作非常简单直观，让用户可以轻松完成各种任务。您只需通过菜单或快捷键打开所需功能，即可享受 Tuff 带来的便利。

## 🔐 安全可靠

我们高度重视用户的安全和隐私。我们保证用户数据不会被泄露或滥用，并提供多重安全机制来保护用户的使用安全。

如果您正在寻找一款跨平台、设计精美且易于使用的桌面软件，Tuff 是您的不二之选。它不仅提供了丰富的功能，还拥有良好的用户体验和开放的社区生态。欢迎使用 Tuff，体验全新的桌面交互！

## 📚 文档

- [文档总索引](./docs/INDEX.md)
- [当前稳定化计划](./docs/plan-prd/TODO.md)
- [项目 PRD 与路线图](./docs/plan-prd/README.md)
- [贡献指南](./.github/docs/contribution/CONTRIBUTING.md)
- [仓库开发说明](./AGENTS.md)

## 💚 社区

<a href="https://linux.do"><img src="https://ld.xh.do/ld-badge.svg" alt="认可 linux.do" width="420"></a>

感谢 [linux.do](https://linux.do) 社区对本项目的关注、反馈与测试。使用问题、缺陷反馈与插件想法，欢迎在社区或 [GitHub Issues](https://github.com/talex-touch/tuff/issues) 提出。

## 🤝 开源协议

本项目基于 **Mozilla 公共许可证 2.0（MPL-2.0）** 开源——详见 [`LICENSE`](./LICENSE)。

## ⁉️ 问题反馈

> 任何不符合 `issue 模板` 的问题将直接被关闭！

请知悉，开发者没有义务解决您提出的问题。本项目的开源和维护工作均基于开发者的业余时间。

## ❤️ 参与贡献

### 开发环境

- 运行时、依赖与构建工具版本以[根目录 package manifest](./package.json)、[CoreApp package manifest](./apps/core-app/package.json)、[workspace catalog](./pnpm-workspace.yaml)和 [lockfile](./pnpm-lock.yaml) 为准。
- 使用 Corepack，并选择根目录 manifest 允许的 Node.js 版本；不要依赖 README 中复制的版本号。

```bash
corepack enable
pnpm install
pnpm core:dev
```

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

## Star History

<a href="https://www.star-history.com/#talex-touch/tuff&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=talex-touch/tuff&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=talex-touch/tuff&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=talex-touch/tuff&type=Date" />
 </picture>
</a>

## ✉️ 联系方式

通过电子邮件 (TalexDreamSoul@Gmail) 或提交 Issue。

Copyright © 2022-PRESENT TalexDreamSoul
