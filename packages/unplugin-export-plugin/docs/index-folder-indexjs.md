# src/prelude 目录打包为单个 index.js

## 背景

插件工程除了常规的 Vite 前端产物（`dist/out`）之外，还存在一个 **Prelude 脚本入口**（历史上是根目录的 `index.js`）。

现在希望把 Prelude 从“单文件脚本”升级成“一个小项目”：推荐在 `src/prelude/` 目录里用 TS/JS 分文件组织逻辑，最终在开发态和构建态都 **整体编译输出为单个 `index.js`**，供主应用作为插件 `manifest.json -> main` 入口加载。

> 2026-05-19 现状补充：标准源码目录切到 `src/prelude/`；历史 `index/` 与 `manifest.build.index` 继续兼容。打包落盘由 `tuff build`/`tuff builder` 负责；暂不提供独立 `build:index` 命令。

## 核心原则（必须遵守）

1) **最终只解析为 `index.js`**
- 不管 Prelude “小项目”内部是 TS/JS、多入口还是多目录结构，最终对主应用暴露的永远是一个 `index.js`（`manifest.json.main` 指向它）。
- `src/prelude/` 只是源码组织方式，不应泄露到运行时契约中。

2) **默认 bundle 优先**
- 默认将第三方依赖打进 `index.js`，让最终插件包保持单文件 Prelude 契约。
- `electron` 与 Node 内置模块保持 external；后续如需 vendor/node_modules 抽离，应作为独立能力再设计。

## 现状（已存在的能力）

`packages/unplugin-export-plugin` 已有能力：

- 探测 `manifest.build.prelude` / `manifest.build.index` / `src/prelude` / 旧 `index/`，按确定性优先级解析 Prelude 入口
- 通过 `esbuild` 将 Prelude 入口 bundle 为 CJS，并在 Vite dev server 的虚拟模块 `load()` 阶段返回
- 内置简单的增量 rebuild（`esbuild.context().rebuild()`）与 debounce
- `/_tuff_devkit/update` 会返回虚拟 `index.js` 的 changed/mtime/size/source 状态，供 core-app 自动 reload 插件生命周期

## 目标

- 插件开发：`src/prelude/` 目录可像“小项目”一样写代码，热更新稳定、重编译快
- 插件构建：构建产物 `dist/build/index.js` 一定存在（来自根 `index.js` 或由 Prelude 源码编译生成）
- 插件运行：主应用只认识 `manifest.json.main = index.js`，无需感知 `src/prelude/`

## 已落地行为

### 1) dev：HMR 体感

目标不是字面意义的“Webpack HMR API”，而是用户的 **开发体验**：

- 修改 `src/prelude/` 内任意文件后，DevKit 增量 rebuild 虚拟 `index.js`
- 避免出现“改了代码但还在跑旧逻辑”的状态错乱
- core-app 的 DevServerHealthMonitor 通过 `/_tuff_devkit/update` 发现 `index.js.changed = true` 后自动调用 `reloadPlugin`

> 注：这里的“HMR”是体验指标：开发者改完保存，插件逻辑能立即更新；并不要求在运行时注入复杂的 HMR runtime。

### 2) 构建阶段的落盘（确保最终产物为 index.js）

- `tuff builder`/打包流程中，`dist/build/index.js` 必须生成
- sourcemap 策略：dev 为 inline，build 由 `manifest.build.prelude.sourcemap` 或全局 `sourcemap` 控制

### 3) 依赖抽离与 external 策略（避免 Prelude 过大）

- 默认 external：`electron`、Node 内置模块（`node:*`）
- 第三方依赖默认 bundle 到 `index.js`
- 可通过 `manifest.build.prelude.external` 显式增加 external 依赖

### 4) 入口解析与约束（小项目入口）

- 入口候选：`src/prelude/main.ts|main.js|index.ts|index.js`
- 显式配置：`manifest.build.prelude.entry`
- 旧配置：`manifest.build.index.entry` 继续兼容

### 5) 与根 index.js 的优先级（避免歧义）

- 若存在 `manifest.build.prelude` 或 `manifest.build.index`，按显式配置打包
- 若根目录存在 `index.js`，默认使用根 `index.js`
- 若不存在根 `index.js` 且存在 `src/prelude/`，则编译 `src/prelude/` 生成 `index.js`
- 若不存在根 `index.js` 且不存在 `src/prelude/`，再兼容旧 `index/`

### 6) manifest.json 与 package.json 版本同步 + 入口可配置

需要在打包流程中自动做两件事：

1) **版本同步**
- `manifest.json.version` 必须与 `package.json.version` 同步
- 每次打包时自动同步（不要求开发者手动改两处）
- 允许一个可选开关：是否覆盖（默认覆盖，避免版本漂移）

2) **脚本入口可配置**
- 虽然最终都输出为 `index.js`，但“源码入口文件”允许通过 `manifest.build.prelude.entry` 配置（例如 `src/prelude/entry.ts`）
- 未配置时自动探测 `main.ts/js`、`index.ts/js`

### 7) 产物可观测性与调试

- build 输出时打印：入口路径、bundle 耗时、输出体积
- 在 `index.js` 顶部插入短 banner，标记来源（`manifest-prelude` / `manifest-index` / `src-prelude` / `legacy-index`）

## 验收标准（建议）

- 插件根目录仅有 `src/prelude/` 时：dev 可运行、build 后 `dist/build/index.js` 可运行
- 插件同时存在根 `index.js` 与 `src/prelude/` 时：默认使用根 `index.js`，显式配置可强制 Prelude
- `src/prelude/` 内多文件改动：dev 重编译稳定（debounce + 增量），不会导致主应用加载到半截代码
- dev 修改 `src/prelude/`：主应用侧可感知更新并自动 reload 插件生命周期
- 旧 `index/` 插件在 `manifest.build.index` 下继续 build
