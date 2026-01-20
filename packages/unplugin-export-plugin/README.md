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

## Index Folder Splitting (Prelude/Surface Separation)

支持将 `index.js` 拆分为 `index/` 文件夹，实现 **Prelude（先导脚本）** 的模块化开发：

### 使用方式

1. 创建 `index/` 文件夹（与 `manifest.json` 同级）
2. 在 `index/` 中创建入口文件：`main.ts`、`main.js`、`index.ts` 或 `index.js`
3. 在入口文件中导入其他模块并导出插件生命周期

### 示例结构

```
my-plugin/
├── manifest.json
├── index/                    # Prelude 脚本文件夹
│   ├── main.ts              # 入口文件（优先级：main.ts > main.js > index.ts > index.js）
│   ├── utils.ts             # 工具函数
│   ├── providers/           # 提供者模块
│   │   ├── google.ts
│   │   └── deepl.ts
│   └── types.ts             # 类型定义
├── src/                      # Surface UI 源码（Vue/React）
│   └── ...
└── package.json
```

### 构建行为

- **开发模式**：`index/` 文件夹实时编译为 `index.js`，支持热重载
- **生产构建**：使用 esbuild 将 `index/` 打包为单个 `index.js` 文件
- **别名支持**：`@` 和 `~` 指向 `index/` 目录
- **外部依赖**：`electron` 自动标记为 external

### 优势

- ✅ **模块化开发**：将复杂的 Prelude 脚本拆分为多个文件
- ✅ **TypeScript 支持**：原生支持 `.ts` 文件
- ✅ **热重载**：开发时修改 `index/` 内文件自动重新编译
- ✅ **零配置**：无需额外配置，自动检测并编译

### 注意事项

- `index/` 文件夹与根目录的 `index.js` 互斥，优先使用 `index/` 文件夹
- 编译后的 `index.js` 为 CommonJS 格式（`format: 'cjs'`）
- 目标环境：Node.js 18+（`target: 'node18'`）

## Intelligence Integration

- 如果插件需要调用智能能力，可在打包时携带 `@talex-touch/tuff-intelligence` 配置文件或默认渠道（如 Tuff Nexus `https://tuff.tagzxia.com/v1`），由主应用加载。
- 建议在插件内使用 utils 类型定义保持与核心一致，避免重复定义模型/能力/提示词结构。
