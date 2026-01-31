# Tuff CLI 分包与迁移提案

> 更新时间: 2026-01-31  
> 依据: 现有实现集中在 `packages/unplugin-export-plugin`（bin/cli/core/types 同包）

## 1. 背景与现状

当前 `tuff` CLI 由 `@talex-touch/unplugin-export-plugin` 提供：
- **入口**: `packages/unplugin-export-plugin/src/bin/tuff.ts`
- **CLI 层**: `src/cli/*`（交互、i18n、create 命令）
- **核心能力**: `src/core/*`（config/dev/build/publish/export）
- **类型与配置**: `src/types.ts`（`defineConfig`, Build/Dev/Publish 类型）
- **模板脚手架**: 依赖外部仓库 `tuff-plugin-template`

现状可用，但存在“单包过度耦合、命名与 PRD 不一致、可复用性弱”的问题。

## 2. 主要问题

1. **职责混杂**：CLI 交互、构建引擎、发布逻辑、unplugin 集成都在一个包中。
2. **命名不一致**：PRD 里有 `@talex-touch/tuffcli`，实际仅有 `@talex-touch/unplugin-export-plugin`。
3. **复用困难**：其他系统想复用发布/构建逻辑只能引入完整 CLI 包。
4. **模板版本不可控**：脚手架依赖 Git 远端模板，版本跟随主分支。

## 3. 目标

- 保持 **`tuff` 命令稳定**，减少用户侧迁移成本。
- 拆出 **可复用核心库**，让 CLI / CI / 其他工具复用能力。
- 清晰划分 **CLI / Core / Build Plugin / Template** 四层。
- 为后续生态扩展（registry、多模板、CI 集成）预留结构。

## 4. 建议分包结构

### 4.1 包清单与职责

| 包名 | 职责 | 现有来源建议 | 备注 |
| --- | --- | --- | --- |
| `@talex-touch/tuff-cli` | `tuff` 命令入口、参数解析、交互与 i18n | `src/bin` + `src/cli` | 仅 CLI UX，不做业务 |
| `@talex-touch/tuff-cli-core` | 命令编排（create/build/dev/publish） | `src/core` + `src/types` | 纯逻辑，可供 CI/SDK 调用 |
| `@talex-touch/tuff-core` | 低层能力（exporter/压缩/签名/版本校验/manifest 解析） | `src/core/exporter.ts` 等 | `tuff-cli-core` 依赖 |
| `@talex-touch/unplugin-export-plugin` | Vite/Webpack/Rollup/esbuild/nuxt 集成 | 现有包 | 依赖 `tuff-core` |
| `@talex-touch/tuff-template` (可选) | 模板版本化与发布 | 外部仓库迁入/镜像 | CLI 指定版本或渠道 |
| `@talex-touch/tuffcli` (兼容别名) | `defineConfig` 与类型导出 | 由 `tuff-cli-core` re-export | 对齐 PRD 文档 |

### 4.2 依赖关系（建议）

```
tuff-cli (bin + prompts)
  -> tuff-cli-core (command orchestration)
       -> tuff-core (export/publish/compress/sign)
       -> unplugin-export-plugin (build integrations)
```

## 5. 兼容策略

1. **保持 `tuff` 命令名不变**：新 `@talex-touch/tuff-cli` 提供 bin。
2. **旧包过渡期**：
   - `@talex-touch/unplugin-export-plugin` 继续发布，但 CLI/核心逻辑逐步迁移。
   - 添加 deprecate 提示：建议安装 `@talex-touch/tuff-cli`。
3. **配置导出迁移**：
   - `@talex-touch/tuffcli` 提供 `defineConfig` 与类型，内部转发到 `tuff-cli-core`。
   - `@talex-touch/unplugin-export-plugin/types` 继续保留一段时间。

## 6. 迁移阶段（建议）

### Phase 0（现状冻结）
- 维持现状，补齐文档声明“CLI 位于 unplugin-export-plugin”。

### Phase 1（抽出 core）
- 将 `core/*` + `types.ts` 抽到 `@talex-touch/tuff-cli-core`。
- `unplugin-export-plugin` 改为依赖 `tuff-cli-core` / `tuff-core`。
- CI 与测试迁移到新包。

### Phase 2（抽出 CLI）
- 新建 `@talex-touch/tuff-cli`，只保留 bin + CLI UX。
- 旧包保留 CLI 的 shim（打印提示并转发）。

### Phase 3（模板治理）
- `tuff-plugin-template` 迁入 monorepo 或镜像发布到 npm（版本化）。
- `tuff create` 支持 `--template-version` 或 `--template-source`。

## 7. 风险与验证

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 包拆分导致 CLI 行为变化 | 用户使用中断 | 保持 `tuff` 命令不变，新增回归测试 |
| 构建与发布逻辑被拆散 | CI/插件构建失败 | 先抽 core，再抽 CLI，分阶段验证 |
| 模板版本漂移 | 新项目不稳定 | 模板版本锁定 + 镜像发布 |

**建议验证集**：
- `tuff help/about` 输出一致
- `tuff create` 端到端（clone + config + install）
- `tuff build/dev/publish --dry-run` 回归
- `unplugin-export-plugin` 在 Vite/webpack/rollup/esbuild/nuxt 保持兼容

## 8. 最小任务清单（MVP 拆包）

- [ ] 新建 `packages/tuff-cli-core` 并迁移 `core/*` + `types.ts`
- [ ] 新建 `packages/tuff-cli` 并迁移 `bin` + `cli/*`
- [ ] `unplugin-export-plugin` 改为依赖 `tuff-cli-core`（保留原 exports）
- [ ] 文档与 PRD 修正：`@talex-touch/tuffcli` 指向新包
- [ ] 增加回归测试：命令输出 + 核心流程 smoke test
