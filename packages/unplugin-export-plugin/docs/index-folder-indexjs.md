# index/ 目录打包为单个 index.js（需求与拆分计划）

## 背景

插件工程除了常规的 Vite 前端产物（`dist/out`）之外，还存在一个 **Prelude 脚本入口**（历史上是根目录的 `index.js`）。

现在希望把 Prelude 从“单文件脚本”升级成“一个小项目”：允许在插件根目录新增 `index/` 目录，里面用 TS/JS 分文件组织逻辑，最终在打包时 **整体编译输出为单个 `index.js`**，供主应用作为插件 `manifest.json -> main` 入口加载。

> 2026-01-20 现状补充: 已确定入口优先级（默认 root `index.js` 优先，`manifest.build.index` 显式启用 index/），
> 打包落盘由 `tuff build`/`tuff builder` 负责；暂不提供独立 `build:index` 命令。

## 核心原则（必须遵守）

1) **最终只解析为 `index.js`**
- 不管 Prelude “小项目”内部是 TS/JS、多入口还是多目录结构，最终对主应用暴露的永远是一个 `index.js`（`manifest.json.main` 指向它）。
- `index/` 只是源码组织方式，不应泄露到运行时契约中。

2) **主界面与 Prelude 共享依赖要可抽离**
- 需要支持把主界面（Vite 产物）与 Prelude（`index.js`）共同用到的依赖抽离出去，避免 Prelude bundle 过大。
- 目标是：插件包内存在一个可复用的依赖目录（例如 `node_modules/` 或专用 `vendor/`），Prelude 运行时能正确 resolve 到这些依赖，而不是把所有依赖都打进 `index.js`。

## 现状（已存在的能力）

`packages/unplugin-export-plugin/src/index.ts` 已有 dev 向的实现：

- 探测插件根目录存在 `index/` 且没有根 `index.js` 时，会虚拟出 `index.js`
- 通过 `esbuild` 将 `index/` 内入口（`main.ts/js` 或 `index.ts/js`）bundle 为 CJS，并在 Vite dev server 的虚拟模块 `load()` 阶段返回
- 内置简单的增量 rebuild（`esbuild.context().rebuild()`）与 debounce

## 目标

- 插件开发：`index/` 目录可像“小项目”一样写代码，热更新稳定、重编译快
- 插件构建：构建产物 `dist/build/index.js` 一定存在（来自根 `index.js` 或由 `index/` 编译生成）
- 插件运行：主应用只认识 `manifest.json.main = index.js`，无需感知 `index/`

## 仍需补齐的点（待实现）

### 1) dev：要有 HMR 体感（至少等价体验）

目标不是字面意义的“Webpack HMR API”，而是用户的 **开发体验**：

- 修改 `index/` 内任意文件后，主应用中的插件 Prelude 行为能在可接受的延迟内更新
- 避免出现“改了代码但还在跑旧逻辑”的状态错乱
- 推荐实现策略（按优先级）：
  - **增量 rebuild + debounce**（已有雏形），并确保 watcher 覆盖 `index/` 全目录
  - 触发主应用侧的插件 reload / prelude reload（如果当前插件体系支持热重载）
  - 若主应用侧无法热重载，至少做到：reload 时不丢状态或给出明确提示（这个取决于主应用能力）

> 注：这里的“HMR”是体验指标：开发者改完保存，插件逻辑能立即更新；并不要求在运行时注入复杂的 HMR runtime。

### 2) 构建阶段的落盘（确保最终产物为 index.js）

当前 `index/ -> index.js` 主要在 dev 的 `load()` 里返回字符串，**但 build 产物阶段还需要落盘**，至少满足：

- `tuff builder`/打包流程中，`dist/build/index.js` 必须生成
- sourcemap 策略明确（建议 `inline` dev、`external` build）

### 3) 依赖抽离与 external 策略（避免 Prelude 过大）

Prelude 运行环境是主应用的插件沙箱（Node/Electron），需要明确：

- 默认 external：`electron`、Node 内置模块（`node:*`）、以及主应用提供的全局注入（`globalThis.plugin/http/logger/...`）
- 是否允许 `index/` 引入第三方依赖：若允许，推荐策略应是 **不把依赖全部 bundle 进 `index.js`**，而是：
  - 将共享依赖落地到插件包内（例如 `dist/build/node_modules/` 或 `dist/build/vendor/`）
  - Prelude 的 `index.js` 通过 Node 标准解析（或受控的 alias/paths）能 resolve 到这些依赖
  - 支持把“主界面 + Prelude”共同用到的依赖合并，避免两边重复打包

建议给一个可配置项（文档层先定义，具体实现后补）：
- `prelude.bundle = 'external' | 'bundle' | 'hybrid'`
  - `external`：尽量 external，依赖落到插件包内（更小的 index.js）
  - `bundle`：全部 bundle 进 index.js（更独立但更大）
  - `hybrid`：白名单 bundle（例如极少数小依赖），其余 external（推荐默认）

### 4) 入口解析与约束（小项目入口）

- 入口候选：`index/main.ts|main.js|index.ts|index.js`
- 缺入口时的报错与提示（当前是 warn）
- 建议新增一个显式配置（可选）：`manifest.json` 或 `vite.config` 里允许指定入口文件名

### 5) 与根 index.js 的优先级（避免歧义）

建议规则：

- 若根目录存在 `index.js`，默认使用根 `index.js`
- 若不存在根 `index.js` 且存在 `index/`，则编译 `index/` 生成 `index.js`
- 若两者都存在，可提供一个显式开关控制“以 `index/` 为准”（避免双入口歧义）

### 6) manifest.json 与 package.json 版本同步 + 入口可配置

需要在打包流程中自动做两件事：

1) **版本同步**
- `manifest.json.version` 必须与 `package.json.version` 同步
- 每次打包时自动同步（不要求开发者手动改两处）
- 允许一个可选开关：是否覆盖（默认覆盖，避免版本漂移）

2) **脚本入口可配置**
- 虽然最终都输出为 `index.js`，但“源码入口文件”应该允许配置（例如 `index/entry.ts`）
- 建议来源（优先级从高到低）：
  - `vite.config`/unplugin 参数显式指定 `preludeEntry`
  - `manifest.json` 扩展字段（例如 `prelude.entry`）
  - 自动探测（`main.ts/js`、`index.ts/js`）

### 7) 产物可观测性与调试

- build 输出时打印：入口路径、bundle 耗时、是否走缓存/增量、输出体积
- 在 `index.js` 顶部插入一段可选 banner（不含版权 header），用于标记来源（root vs index/ build）

## 验收标准（建议）

- 插件根目录仅有 `index/` 时：dev 可运行、build 后 `dist/build/index.js` 可运行
- 插件同时存在根 `index.js` 与 `index/` 时：规则稳定可控，不会随机选
- `index/` 内多文件改动：dev 重编译稳定（debounce + 增量），不会导致主应用加载到半截代码
- dev 修改 `index/`：主应用侧可感知更新（HMR 体验），至少做到热重载一致性与无“旧逻辑残留”
- Prelude `index.js` 体积可控：共享依赖可抽离到插件包内，避免重复/过大 bundle
