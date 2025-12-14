# TalexTouch # PluginExporter

> 📦 **TuffCLI**: 本包现已集成到 TuffCLI 工具链中，通过 `tuff` 命令进行插件的构建、发布和管理。
>
> ```bash
> tuff build    # 构建插件
> tuff publish  # 发布插件
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

`vite build` or `vite-ssg build` only generate regular Vite artifacts. You need to run the provided CLI to pack them into `.tpex`:

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
