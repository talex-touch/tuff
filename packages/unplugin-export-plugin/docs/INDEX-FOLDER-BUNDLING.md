# Prelude Bundling Compatibility

> 2026-05-19：新插件推荐使用 `src/prelude/`。本文件保留旧 `index/` 能力的兼容说明，完整设计见 [`index-folder-indexjs.md`](./index-folder-indexjs.md)。

## 当前规则

- 最终运行时入口仍固定为 `index.js`。
- 显式 `manifest.build.prelude` 优先，其次兼容 `manifest.build.index`。
- 未显式配置时，优先使用根目录 `index.js`。
- 根目录没有 `index.js` 时，自动探测 `src/prelude/main.ts|main.js|index.ts|index.js`。
- 只有在没有根 `index.js` 且没有 `src/prelude` 入口时，才回退探测旧 `index/main.ts|main.js|index.ts|index.js`。

## 推荐结构

```
plugin/
├── manifest.json
├── src/
│   ├── prelude/
│   │   ├── main.ts
│   │   └── utils.ts
│   └── ...
└── package.json
```

可选配置：

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

## 旧 index/ 兼容

旧插件可继续使用：

```json
{
  "build": {
    "index": {
      "entry": "index/main.ts",
      "format": "cjs"
    }
  }
}
```

该配置仍会在 `tuff build` / `tuff builder` 阶段打包为 `dist/build/index.js`，dev 态也会通过虚拟 `index.js` 提供给 core-app。

## Dev HMR 体感

- DevKit 使用 esbuild incremental rebuild + debounce。
- `/_tuff_devkit/update` 返回虚拟 `index.js` 的 `changed`、`lastModified`、`size`、`source`。
- core-app 的 DevServerHealthMonitor 在后续轮询中发现 `index.js.changed = true` 后自动 reload 插件生命周期。

## 依赖策略

- 第三方依赖默认 bundle 到 `index.js`。
- `electron` 与 Node 内置模块通过 `external: ["electron", "node:*"]` 保持外部解析。
- 暂不实现 vendor/node_modules 抽离；如需外置依赖，可显式增加 `external` 并自行保证运行时可解析。
