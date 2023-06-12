<div align="center">

  <img width="160" src="https://files.catbox.moe/2el8uf.png" alt="logo">

  <h1>TalexTouch</h1>

  Design reference <b>TDesignS</b>

  [![GitHub issues](https://img.shields.io/github/issues/talex-touch/talex-touch?style=flat-square)](https://github.com/talex-touch/talex-touch/issues)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Ftalex-touch%2Ftalex-touch.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Ftalex-touch%2Ftalex-touch?ref=badge_shield)
  [![GitHub license](https://img.shields.io/github/license/talex-touch/talex-touch?style=flat-square)](https://github.com/talex-touch/talex-touch/blob/main/LICENSE)
  [![GitHub release](https://img.shields.io/badge/release-1.2.0-42B883?style=flat-square)](https://github.com/talex-touch/talex-touch/releases)
  [![GitHub release](https://img.shields.io/badge/dev-2.0.0-64391A?style=flat-square)](https://github.com/talex-touch/talex-touch/discussions/35)

  English | [简体中文](./CONTRIBUTING_zh.md)
</div>

# Tutorial

`TalexTouch` is at the bud stage, the power of the individual developers is negligible. Therefore, we are very support and agree with you to participate in the project of research and development, maintenance.

## Make a optimization to the project

> About Animation/UI/UX Design

Of course! We are very support this kind of behavior, but please note that everything is given priority to with the user experience. Your design must be reference for the design of the project itself, otherwise it would be a disaster.

## Can I add new functions/features

Sorry! We as much as possible the current primary goal is to optimize the program and to provide users with a good UI design. If you want to provide new functionality Suggestions to develop new plugins.

## Pull Request

### Precondition

1. Fork this repository.
2. Check-out branch `master`
3. Create your own branch on `head` and name it according to your preferences
4. Start your develop
5. When all things done, please create a `PULL REQUEST` about what you developed.

> Tip: Advice before development puts forward a issue to avoid being deny when you try to merge.

#### Added

1. All things you posted must be validated and follow as standard format.
2. `Commit Message` should be referred as follows. If your pr is vital but not match the format, we will adopt measures to squash, rather than the merge
   This will affect your `Contribution Commits` on our repository. Please noted.

#### Commit Message

1. `Commit Message` are supposed to like: prefix<range?>: brief description (range is optional)
2. We use `husky` `commitlint` to ensure your commit message follow our protocols.
3. You can refer these:
   - Fix<xxx>: message
   - Feat<xxx>: message
   - Test<xxx>: message
   - Build<xxx>: message
   - Docs<xxx>: message
   - Add<xxx>: message
   - Upd<xxx>: message (Update dependencies versions)
   - Change<xxx>: message (The last one to choose) [Fallback]
   - More see `commitlint.config.js`
4. The xxx is what you update and a area or a module:
   - Abstract range like PluginModule
   - Specific single file like touch-core.ts
   - Implementation of new features like SqlStorage
5. The merge commit such as automatically generated a commit message is not subject to this restriction
6. If you really not want to obey by the rules, you can directly use the `Change: xxxxxx`

## Project Structures

> Here just list the development need of large probability.

``` yaml
  Touch tree helper:
 > talex-touch:
   ├── app: (Main applications)
   ├─── core: (Electron application)
   ├─── docs: (Document application)
   ├─── ends: (Ends Application) # Abandoned
   ├── packages: (Assistant packages)
   ├─── components: (Touch components)
   ├─── test: (Util tests)
   ├─── touch-view: (Component display)
   ├─── utils: (Assistant Utils)
   ├── plugins: (Official plugins)
```

## Collaborator Tutorial

If you received a mysterious blue links from our warehouse，Click it，You became a glorious TalexTouch Collaborator！You could：

- Have a handsome collaborator in Issues identified
- Push to the main warehouse directly (you can delete the fork before!)
- Audit others pull request

### [Guide Reference](https://github.com/TalexDreamSoul/touchq/blob/main/.github/contribute/README.md)
