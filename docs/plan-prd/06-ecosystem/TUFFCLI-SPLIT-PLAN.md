# Tuff CLI 分包与迁移提案（执行回填版）

> 更新时间: 2026-03-16  
> 执行结论: Phase1 + Phase2 已完成（`tuff-cli` 主入口、`tuff-cli-core` 内部核心编排、`unplugin` 兼容 shim）；独立 `@talex-touch/tuffcli` npm 兼容包已退场。

## 1. 背景与现状（历史）

历史上 `tuff` CLI 由 `@talex-touch/unplugin-export-plugin` 提供：
- **入口**: `packages/unplugin-export-plugin/src/bin/tuff.ts`
- **CLI 层**: `src/cli/*`（交互、i18n、create 命令）
- **核心能力**: `src/core/*`（config/dev/build/publish/export）
- **类型与配置**: `src/types.ts`（`defineConfig`, Build/Dev/Publish 类型）
- **模板脚手架**: 依赖外部仓库 `tuff-plugin-template`

现状可用，但存在“单包过度耦合、命名与 PRD 不一致、可复用性弱”的问题。

## 2. 主要问题

1. **职责混杂**：CLI 交互、构建引擎、发布逻辑、unplugin 集成都在一个包中。
2. **命名不一致**：历史 PRD 里有 `@talex-touch/tuffcli`，但最终收敛为 `@talex-touch/tuff-cli` 对外发布包，并由该包继续提供 `tuffcli` bin。
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
| `@talex-touch/tuff-cli-core` | 命令编排（create/build/dev/publish） | `src/core` + `src/types` | 内部 workspace 包，由 `tuff-cli` 构建打包，不单独发布 |
| `@talex-touch/tuff-core` | 低层能力（exporter/压缩/签名/版本校验/manifest 解析） | `src/core/exporter.ts` 等 | `tuff-cli-core` 依赖 |
| `@talex-touch/unplugin-export-plugin` | Vite/Webpack/Rollup/esbuild/nuxt 集成 | 现有包 | 依赖 `tuff-core` |
| `@talex-touch/tuff-template` (可选) | 模板版本化与发布 | 外部仓库迁入/镜像 | CLI 指定版本或渠道 |

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
   - 不再维护独立 `@talex-touch/tuffcli` npm 包，避免与 `@talex-touch/tuff-cli` 命名和发布职责重复。
   - `@talex-touch/unplugin-export-plugin/types` 继续作为低层构建插件类型入口保留一段时间。
4. **退场时间窗（锁定）**：
   - `2.4.x`：保留旧 CLI shim（仅转发 + 提示）。
   - `2.5.0`：移除 shim，旧入口不再承载 CLI 命令逻辑。

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

- [x] 新建 `packages/tuff-cli-core` 并迁移 `core/*` + `types.ts`（2026-03-15 已完成）
- [x] 新建 `packages/tuff-cli` 并迁移 `bin` + `cli/*`（主入口已切换，兼容层保留）
- [x] `unplugin-export-plugin` CLI 降级为 shim（deprecation + 转发），保留原 exports（2026-03-15）
- [x] 文档与 PRD 修正：独立 `@talex-touch/tuffcli` 兼容包退场，对外入口收敛为 `@talex-touch/tuff-cli`（2026-04-28）
- [x] 增加回归测试：命令输出 + 核心流程 smoke test（`help/create/build/dev/publish/validate` 最小烟雾已验证）
