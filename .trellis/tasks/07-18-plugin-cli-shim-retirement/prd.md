# 完成 CLI shim 退场

## Goal

在所有插件构建/发布调用者迁移到 canonical `@talex-touch/tuff-cli` + `tuff-cli-core` 后，删除重复 exporter 和弃用命令 shim，使 `tuff` 成为唯一受支持 CLI，同时保留 `unplugin-export-plugin` 的 Vite 插件职责。

## Confirmed Facts

- `@talex-touch/tuff-cli` 同时暴露 `tuff` 与 `tuffcli` bin，内部默认命令名仍回退到 `tuffcli`。
- `packages/unplugin-export-plugin/src/bin/tuff.ts` 仅打印弃用告警并转发到新 CLI，但该包仍维护重复 `src/core/exporter.ts`。
- `tuff-cli` tsup 仍 noExternal legacy unplugin exporter；Vite dev/build 仍动态导入其 `/vite` 入口。
- 部分插件仍直接依赖/导入 `@talex-touch/unplugin-export-plugin` 的 Vite 能力；该 Vite API 不属于要删除的 CLI shim。

## Requirements

1. `tuff-cli-core` 成为 Manifest validate、builder、publish、auth/config 的唯一实现；删除或改写所有重复 exporter 调用者后再删除 legacy 实现。
2. `@talex-touch/tuff-cli` 只发布 `tuff` bin，帮助、错误、文档和环境默认命令名统一为 `tuff`；移除 `tuffcli` bin/forwarding。
3. `unplugin-export-plugin` 保留 Vite plugin exports 和 dev integration，但移除 CLI bin、转发入口、重复 build/compress/security utilities 及不再需要的依赖。
4. 迁移所有 workspace scripts、官方插件、文档、tests、tsup config 和 lockfile；不得保留 alias、deprecated re-export 或双实现 fallback。
5. 为 clean install/build/publish 提供迁移错误：旧命令应明确失败并指向 `tuff`，而不是静默调用旧代码。
6. 切换必须发生在 package policy、scan、signing 已接入 canonical CLI 后，避免删除 shim 时丢失供应链门禁。

## Acceptance Criteria

- [ ] workspace/lockfile/发布产物中不再有 `tuffcli` bin、legacy CLI forwarder 或重复 exporter 实现。
- [ ] `unplugin-export-plugin/vite` 的现有 Vite dev/build 契约和插件 consumers 保持可用。
- [ ] 所有官方插件脚本和文档只使用 `tuff validate/build/builder/publish`。
- [ ] `tuff` clean install 后可执行 validate、builder、dry-run publish；命令输出不再显示 `tuffcli`。
- [ ] 搜索无旧 bin/import/re-export/环境 fallback 调用者；必要的历史文档只可明确标注 obsolete，不可作为可执行指引。
- [ ] CLI core、CLI entrypoint、Vite plugin、official plugin focused builds/tests、package pack inspection 和 lint/typecheck 通过。

## Out of Scope

- 删除 `unplugin-export-plugin` 的 Vite 插件产品能力。
- 改名 `.tpex` 格式或插件 Manifest 字段。
- 保留无限期兼容 alias。

