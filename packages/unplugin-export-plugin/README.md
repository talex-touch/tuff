# TalexTouch # PluginExporter

> 📦 **TuffCLI**: 本包现已集成到 TuffCLI 工具链中，通过 `tuff` 命令进行插件的构建、发布和管理。
>
> ```bash
> tuff dev      # 启动开发服务器
> tuff build    # 构建并打包插件
> tuff publish  # 发布插件包
> ```

[![NPM version](https://img.shields.io/npm/v/@talex-touch/unplugin-export-plugin?color=a1b858&label=)](https://www.npmjs.com/package/unplugin-starter)

Export **unplugin** for [talex-touch](https://github.com/talex-touch/talex-touch).

## Install

```bash
npm i @talex-touch/unplugin-export-plugin
```

Next in your `vite.config.js` or `vite.config.ts`

### Vite

``` ts
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'

export default defineConfig({
  plugins: [
    ....,
    TouchPluginExport()
  ],
})
```

## Description

### Auto Generate Manifest

It will automatically generate a `manifest.json` when you build.

### Auto Wrap Project -> Plugin

Generate a `touch-plugin` file on the `build` folder!

For more about it, see the source code.

### Build Plugin Package

`tuff build` 会执行 Vite 构建并打包 `.tpex`。如果你已经手动完成了 Vite 构建，也可以使用 `tuff builder` 仅执行打包：

```bash
vite build && tuff builder
# or
vite-ssg build && tuff builder
```

You can also add a script in `package.json`:

```json
{
  "scripts": {
    "build": "vite build && tuff builder"
  }
}
```

The CLI will read `dist/` and generate `dist/out` and `dist/build` folders. The final `.tpex` file will be in `dist/build/`.

Extra commands:

```bash
tuff help   # show command list
tuff about  # tool info
 tuff login  # save auth token
 tuff logout # clear auth token
```

Your result can refer to this

```
dist/
  ├── out/                    # Vite build output
  │   ├── index.html
  │   ├── assets/
  │   └── *.js, *.css
  ├── build/                  # All content packed into tpex (keep)
  │   ├── index.html          # Copy from out
  │   ├── assets/             # out's assets + merged assets
  │   ├── *.js, *.css         # Copy from out
  │   ├── index.js            # Project root directory
  │   ├── widgets/            # Project root directory
  │   ├── preload.js          # Project root directory
  │   ├── README.md           # Project root directory
  │   ├── manifest.json       # Generated
  │   └── key.talex           # Generated
  └── xxx-1.0.0.tpex         # Final plugin package
```

## Inspiration

Inspired by [vite](https://vitejs.dev/)

## Thanks

Thanks to [@antfu](https://github.com/antfu)'s [template](https://github.com/antfu/unplugin-starter)

## Contact

You could contact us through `TalexDreamSoul@Gmail.com`

## Prelude Engineering (Prelude/Surface Separation)

支持将 `index.js` 拆分为 `src/prelude/` 源码目录，实现 **Prelude（先导脚本）** 的模块化开发。运行时和最终 `.tpex` 成品仍只暴露单个 `index.js`。

### 使用方式

1. 创建 `src/prelude/` 文件夹
2. 在 `src/prelude/` 中创建入口文件：`main.ts`、`main.js`、`index.ts` 或 `index.js`
3. 在入口文件中导入其他模块并导出插件生命周期

### 示例结构

```
my-plugin/
├── manifest.json
├── src/
│   ├── prelude/             # Prelude 源码目录
│   │   ├── main.ts          # 入口文件（优先级：main.ts > main.js > index.ts > index.js）
│   │   ├── utils.ts
│   │   ├── providers/
│   │   │   ├── google.ts
│   │   │   └── deepl.ts
│   │   └── types.ts
│   └── ...                  # Surface UI 源码（Vue/React）
└── package.json
```

### 可选配置

```json
{
  "build": {
    "prelude": {
      "entry": "src/prelude/main.ts",
      "target": "node24",
      "external": ["electron", "node:*"],
      "minify": true,
      "sourcemap": false
    }
  }
}
```

历史插件的 `manifest.build.index` 与 `index/` 目录继续兼容。默认优先级为：显式 `build.prelude` / `build.index` 配置 > 根 `index.js` > `src/prelude` > 旧 `index/`。

### 构建行为

- **开发模式**：`src/prelude/` 实时编译为虚拟 `index.js`，Dev Server 的 `/_tuff_devkit/update` 会暴露 `index.js` 变化状态，core-app 可自动 reload 插件生命周期
- **生产构建**：使用 esbuild 将 `src/prelude/` 打包为 `dist/build/index.js`
- **别名支持**：`@` 和 `~` 指向 Prelude 入口所在目录
- **依赖策略**：默认 bundle 第三方依赖；`electron` 与 Node 内置模块保持 external

### 优势

- ✅ **模块化开发**：将复杂的 Prelude 脚本拆分为多个文件
- ✅ **TypeScript 支持**：原生支持 `.ts` 文件
- ✅ **热重载体感**：开发时修改 `src/prelude/` 内文件自动重新编译并触发插件 reload
- ✅ **零配置**：无需额外配置，自动检测并编译

### 注意事项

- 根目录 `index.js` 仍是传统模式；存在根 `index.js` 且没有显式配置时，不会自动使用 `src/prelude/`
- 编译后的 `index.js` 为 CommonJS 格式（`format: 'cjs'`）
- 目标环境：Node.js 24+（`target: 'node24'`）

## Intelligence Integration

- 如果插件需要调用智能能力，可在打包时携带 `@talex-touch/tuff-intelligence` 配置文件或默认渠道（如 Tuff Nexus `https://tuff.tagzxia.com/v1`），由主应用加载。
- 建议在插件内使用 utils 类型定义保持与核心一致，避免重复定义模型/能力/提示词结构。
