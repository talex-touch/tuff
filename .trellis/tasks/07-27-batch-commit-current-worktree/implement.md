# Implementation Plan — 分批提交当前工作区改动

## Audit

- [x] 获取完整状态、diff/stat、未跟踪文件、远端 ahead/behind 状态。
- [x] 按功能与任务归属核对文件依赖，确定最终提交清单和顺序。
- [x] 运行提交前基础检查，确认无 whitespace/冲突标记问题。

## Commit Batches

- [x] 提交工作区依赖 catalog 元数据。
- [x] 提交 CoreApp 安全与系统交互修复。
- [x] 提交 Prelude 隔离、typed capability、业务适配器与官方插件迁移。
- [x] 提交 Nexus 全局搜索 overlay 层级修复。
- [x] 提交 Nexus 其余界面、文案与图标展示修复。
- [x] 提交 Trellis 任务研究、计划和验证证据。

## Validation And Push

- [x] 运行 CoreApp focused tests、Node/Web typecheck、插件 validation、build 与 Electron smoke。
- [x] 运行 Nexus focused tests 与 typecheck。
- [x] 确认提交序列合理且相对远端仅 ahead。
- [ ] 普通推送 `master` 到 `origin/master`，并验证远端引用等于本地 `HEAD`。

## Validation Evidence

- CoreApp plugin host/plugin suite: 16 files, 384 tests passed.
- CoreApp system/native/network suite: 4 files, 34 tests passed.
- CoreApp Node and Web typechecks passed.
- CoreApp production `build:vite` passed; Electron smoke reported `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
- Emoji plugin: 8 tests passed; plugin package validation: 24/24 passed.
- Nexus overlay: 4 tests passed; scoped ESLint and Nuxt typecheck passed.
- `git diff --check` passed before batching; every staged batch passed `git diff --cached --check` and repository pre-commit hooks.

## Rollback Points

- 每次提交前暂存区都是唯一边界；边界不正确时只执行 `git restore --staged -- <paths>` 调整暂存，不修改工作区内容。
- 验证失败时停止后续提交或推送，定位到对应功能组；禁止通过跳过检查或 force push 绕过失败。
