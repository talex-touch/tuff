# Journal - TalexDreamSoul (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-08-15

---



## Session 53: CoreBox macOS 唤起不再激活整个应用

**Date**: 2026-08-15
**Task**: CoreBox macOS 唤起不再激活整个应用
**Branch**: `feat/nexus-header-controls-tuffex`

### Summary

用最小 Electron 脚本证伪了「Electron 未暴露 nonactivatingPanel」这个前提：box 窗口本就是 type:'panel'（NSWindowStyleMaskNonactivatingPanel），show()+focus() 即可取得键焦点并接收输入而不激活应用，因此 darwin 分支移除 app.focus({steal:true})，并删掉上一版未提交的 app.hide()/dismissApplication 补偿机制（应用级隐藏会在下次激活时把全部窗口 unhide）。不激活会失去两个由激活顺带提供的窗口特性，必须成对补上：setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true}) 与 setAlwaysOnTop(true,'floating')。只补前者导致回归事故——窗口开在前台应用背后，而 isVisible/isFocused/opacity/bounds 全部报正常，靠临时 SHOWDIAG 日志才定位。仓库内 OmniPanel/助手浮球/图译贴图三处早已成对使用该组合。真机确认：唤起不再带出其他 Tuff 窗口，中文输入法正常。core-app vitest 726 文件/6220 用例，唯一失败 plugin-runtime-rollout 可独立复现，源于并行修改的插件 manifest。未实测项：跨应用全屏 Space、插件 UI 模式 WebContentsView 键盘。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fe1e1df06` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
