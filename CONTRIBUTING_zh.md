<div align="center">

  <img width="160" src="https://files.catbox.moe/2el8uf.png" alt="logo">

  <h1>TalexTouch</h1>

  设计参考 <b>TDesignS</b>

  [![GitHub issues](https://img.shields.io/github/issues/talex-touch/talex-touch?style=flat-square)](https://github.com/talex-touch/talex-touch/issues)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Ftalex-touch%2Ftalex-touch.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Ftalex-touch%2Ftalex-touch?ref=badge_shield)
  [![GitHub license](https://img.shields.io/github/license/talex-touch/talex-touch?style=flat-square)](https://github.com/talex-touch/talex-touch/blob/main/LICENSE)
  [![GitHub release](https://img.shields.io/badge/release-1.2.0-42B883?style=flat-square)](https://github.com/talex-touch/talex-touch/releases)
  [![GitHub release](https://img.shields.io/badge/dev-2.0.0-64391A?style=flat-square)](https://github.com/talex-touch/talex-touch/discussions/35)

  [English](./CONTRIBUTING.md) | 简体中文
</div>

# 贡献指南

`talex-touch` 处于萌芽阶段，个人开发者的力量是微不足道的。作者并没有足够的时间来完善和维护这个项目，因此，我们非常支持并且赞同您的亲自操刀，参与到项目的研发，维护中。

## 我可以对项目做出优化吗

> 关于 动效/UI/UX 设计

当然可以。我们非常支持这种行为，但是请注意，一切以用户体验为主。您的设计必须参考项目本身的设计，否则这将会是一场灾难。

## 我可以添加新功能/特性吗

非常抱歉。我们当前的主要目标是尽可能优化程序,为用户提供一个良好的界面设计。如果你想提供新功能建议开发新的插件。

## Pull Request

### 前置条件

1. Fork 这个仓库
2. 签出分支 `master`
3. 创建你自己的 `head` 在分支，随你喜好命名。
4. 开始你的开发
5. 开发完成后，请在本仓库创建一个 `PULL REQUEST` （描述你做了什么）

> Tip: 建议在开发前优先提出一个目的 `Issue` 以此来避免被拒绝 **merge**

#### 除此之外

1. 所有的代码必须经过验证并且遵循我们的标准格式
2. `Commit Message` 应当遵循我们所指出的。 如果你的 pr 是十分重要但是并不符合标准，我们为采取 `Squash` 而不是 `Merge`。这会影响到您的 `Contribution Commits`，请注意！

#### Commit Message

1. `Commit Message` 应当像: 前缀<范围?>: 简短的描述 (范围 是可选的)
2. 我们使用 `husky` `commitlint` 来确保您的信息符合我们的协议。
3. 前缀 可以参考:
   - Fix<xxx>: message
   - Feat<xxx>: message
   - Test<xxx>: message
   - Build<xxx>: message
   - Docs<xxx>: message
   - Add<xxx>: message
   - Upd<xxx>: message (诸如更新dependencies的版本也可)
   - Change<xxx>: message (应当留作备选)
   - 更多请参考 `commitlint.config.js`
4. XXX 是你更新了什么，或者是一个抽象范围、模块:
   - 抽象范围 像是 PluginModule
   - 具体文件 像是 touch-core.ts
   - 新的实现 像是 SqlStorage
5. 由各种工具自动生成的 `Commit Message` 不受此限制。
6. 如果你真的不想遵守我们的标准，你可以直接使用 `Change: xxxxxx`

## 项目结构

> 这里仅仅列出了开发中很有可能会用到的文件。

``` yaml
  Touch tree helper:
 > talex-touch:
   ├── app: (主要的应用)
   ├─── core: (Electron 应用)
   ├─── docs: (文档应用)
   ├─── ends: (后端应用) # 废弃
   ├── packages: (辅助包)
   ├─── components: (Touch 组件)
   ├─── test: (辅助工具测试)
   ├─── touch-view: (Touch 展示框架)
   ├─── utils: (辅助工具)
   ├── plugins: (官方插件)
```

## Collaborator 开发指南

如果你收到了来自本仓库的神秘蓝色链接，点击它，你就成为了一名光荣的 TouchQ Collaborator！你将可以：

- 在 Issues 中有一个帅气的 collaborator 标识
- 直接推送到主仓库（你可以把之前的 fork 删掉啦）
- 审核其他人的 pull request

### [引导 参考](https://github.com/TalexDreamSoul/touchq/blob/main/.github/contribute/README.md)
