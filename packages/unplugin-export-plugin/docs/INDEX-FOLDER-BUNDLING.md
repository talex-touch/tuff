# Index Folder Bundling Feature

## 概述

允许插件开发者创建 `index/` 文件夹作为一个小型项目，包含多个模块文件，最终编译打包为单个 `index.js` 文件。

## 问题背景

当前插件结构要求 `index.js` 是单个文件：

```
plugin/
├── manifest.json
├── index.js          ← 单文件，逻辑复杂时难以维护
├── preload.js
└── public/
```

当插件逻辑复杂时，开发者需要：
- 拆分代码到多个模块
- 使用第三方库
- 复用代码片段

## 解决方案

支持 `index/` 文件夹结构，自动打包为 `index.js`：

```
plugin/
├── manifest.json
├── index/                    ← 新增：index 项目文件夹
│   ├── main.ts              ← 入口文件
│   ├── utils/
│   │   ├── helper.ts
│   │   └── formatter.ts
│   ├── services/
│   │   └── api-service.ts
│   └── package.json         ← 可选：依赖管理
├── preload.js
└── public/
```

构建后输出：

```
dist/build/
├── manifest.json
├── index.js                 ← 打包后的单文件
├── preload.js
└── public/
```

---

## 配置

### manifest.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "build": {
    "index": {
      "entry": "index/main.ts",
      "format": "cjs",
      "target": "node18",
      "external": ["electron"],
      "minify": true
    }
  }
}
```

### 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `entry` | `string` | `index/main.ts` | 入口文件路径 |
| `format` | `'cjs' \| 'esm'` | `'cjs'` | 输出格式 |
| `target` | `string` | `'node18'` | 编译目标 |
| `external` | `string[]` | `['electron']` | 外部依赖（不打包） |
| `minify` | `boolean` | `true` | 是否压缩 |
| `sourcemap` | `boolean` | `false` | 是否生成 sourcemap |

---

## 入口优先级（确定性规则）

1. 若存在 `manifest.build.index` 配置（即使为空对象），视为显式启用 index/ 打包
   - `entry` 存在时以其为准
   - 未提供 `entry` 时自动探测 `index/` 下 `main.ts/js` 或 `index.ts/js`
2. 若未配置 `manifest.build.index` 且根目录存在 `index.js`，默认使用根 `index.js`
3. 若根目录无 `index.js` 且存在 `index/` 入口文件，则打包 `index/` 输出 `index.js`
4. 若两者都不存在，则不会生成 `index.js`（插件运行将不完整）

## CLI 对应关系

- `tuff build` / `tuff builder` 会在打包阶段处理 `index/` → `index.js`
- 当前无单独的 `build:index` 命令

## 实现设计

### 检测逻辑

```typescript
// exporter.ts
async function detectIndexFolder(): Promise<IndexConfig | null> {
  const indexDir = path.resolve('index')
  
  if (!fs.existsSync(indexDir)) {
    return null
  }
  
  // 查找入口文件
  const entryFiles = ['main.ts', 'main.js', 'index.ts', 'index.js']
  for (const file of entryFiles) {
    if (fs.existsSync(path.join(indexDir, file))) {
      return {
        entry: path.join(indexDir, file),
        detected: true
      }
    }
  }
  
  return null
}
```

### 打包流程

```typescript
import * as esbuild from 'esbuild'

async function bundleIndexFolder(config: IndexBuildConfig): Promise<void> {
  const result = await esbuild.build({
    entryPoints: [config.entry],
    bundle: true,
    format: config.format || 'cjs',
    target: config.target || 'node18',
    platform: 'node',
    outfile: path.join(buildDir, 'index.js'),
    external: config.external || ['electron'],
    minify: config.minify ?? true,
    sourcemap: config.sourcemap ?? false,
    
    // 插件 API 注入
    define: {
      '__PLUGIN_NAME__': JSON.stringify(manifest.name),
      '__PLUGIN_VERSION__': JSON.stringify(manifest.version),
    },
    
    // 解析别名
    alias: {
      '@': path.resolve('index'),
      '~': path.resolve('index'),
    },
  })
  
  if (result.errors.length > 0) {
    throw new Error('Index folder bundling failed')
  }
}
```

### 依赖处理

如果 `index/package.json` 存在：

```typescript
async function resolveIndexDependencies(): Promise<string[]> {
  const pkgPath = path.resolve('index/package.json')
  
  if (!fs.existsSync(pkgPath)) {
    return []
  }
  
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const deps = Object.keys(pkg.dependencies || {})
  
  // 检查是否需要打包或标记为 external
  return deps
}
```

---

## 开发模式

### HMR 支持

```typescript
// index.ts (unplugin)
configureServer(server: ViteDevServer) {
  const indexDir = path.resolve('index')
  
  if (fs.existsSync(indexDir)) {
    // 监听 index 目录变化
    server.watcher.add(indexDir)
    
    server.watcher.on('change', async (file) => {
      if (file.startsWith(indexDir)) {
        // 重新打包 index 文件夹
        await rebuildIndex()
        
        // 通知客户端热更新
        server.ws.send('tuff:index-update', {
          timestamp: Date.now()
        })
      }
    })
  }
}
```

### 增量编译

使用 esbuild 的增量编译能力：

```typescript
let indexContext: esbuild.BuildContext | null = null

async function initIndexBuildContext() {
  indexContext = await esbuild.context({
    entryPoints: [config.entry],
    bundle: true,
    // ... 其他配置
  })
}

async function rebuildIndex() {
  if (indexContext) {
    await indexContext.rebuild()
  }
}
```

---

## 示例

### 基础示例

```
index/
├── main.ts
└── utils.ts
```

**main.ts**
```typescript
import { formatMessage } from './utils'

export function onFeatureTriggered(featureId: string, query: string) {
  console.log(formatMessage(query))
}
```

**utils.ts**
```typescript
export function formatMessage(msg: string): string {
  return `[Plugin] ${msg}`
}
```

### 使用第三方库

```
index/
├── main.ts
├── package.json
└── services/
    └── crypto.ts
```

**package.json**
```json
{
  "dependencies": {
    "lodash-es": "^4.17.21"
  }
}
```

**main.ts**
```typescript
import { debounce } from 'lodash-es'
import { encrypt } from './services/crypto'

const debouncedSearch = debounce((query: string) => {
  // ...
}, 300)
```

### 使用别名

```typescript
// index/services/api.ts
import { helper } from '@/utils/helper'  // → index/utils/helper.ts
```

---

## 构建输出

### 成功输出

```
 Talex-Touch  Detecting index folder...
 Talex-Touch  Found index/main.ts as entry point
 Talex-Touch  Bundling index folder with esbuild...
 Talex-Touch  Index folder bundled successfully (12.5kb → 4.2kb minified)
 Talex-Touch  Output: dist/build/index.js
```

### 错误处理

```
 ERROR  Index folder bundling failed:
  - index/main.ts:15:10: Cannot find module './missing-file'
  - index/services/api.ts:3:1: 'fetch' is not defined in Node.js
```

---

## 兼容性

- 如果存在 `index.js` 文件（传统模式），优先使用
- 如果存在 `index/` 目录，自动使用文件夹打包模式
- 两者不能同时存在

---

## CLI 命令

```bash
# 手动触发 index 打包（开发调试用）
tuff build:index

# 查看打包分析
tuff build:index --analyze
```

---

## 待实现

- [ ] 检测 `index/` 目录存在
- [ ] 集成 esbuild 打包
- [ ] 开发模式 HMR 支持
- [ ] 增量编译优化
- [ ] CLI 命令支持
- [ ] 错误提示优化
