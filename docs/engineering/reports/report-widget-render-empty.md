# Widget 渲染空白排查报告

## 现象
- WidgetRegistry 日志显示 `registered widget`，WidgetFrame 日志显示 `renderer ready` 与 `light component mounted`。
- DOM 结构中 `WidgetFrame` 下只有注释节点 `<!-- -->`，内容为空。
- payload 为空时仍应显示组件内占位内容，但实际不渲染。

## 复现路径
- PluginFeatures -> Widget 预览。
- widgetId：`touch-translation::touch-translate`（translate-panel）。

## 关键证据
- 编译产物 `touch-translation__touch-translate.cjs` 尾部：
```
const __component = exports.default || module.exports || {};
if (__component && exports.render) {
  __component.render = exports.render;
}
module.exports = __component;
```
- 运行时执行 `evaluateWidgetComponent` 后仅取 `module.exports.default` 作为组件。
- `exports` 与 `module.exports` 在 `module.exports = __toCommonJS(...)` 后不再指向同一对象。

## 结论
组件对象被注册成功，但 render 没有绑定到 default，导致 Vue 挂载后渲染为空。

## 根因分析
CommonJS 编译产物采用 `exports.render` 暴露 render 函数，但运行时只读取 `module.exports.default`，且未对 `module.exports.render` 做兜底绑定。由于 `exports` 已与 `module.exports` 分离，`exports.render` 不会出现在 `module.exports.default` 上。

## 影响范围
- 由 Vue SFC 编译的 `.cjs` 产物，且 render 通过 `exports.render` 输出的场景。
- 表现为“组件 mounted，但 DOM 为空”。

## 修复方案
在 `evaluateWidgetComponent` 中做 normalize：
- 若存在 `module.exports.default` 与 `module.exports.render`，且 `default.render` 为空，则强制挂载。

示例逻辑：
```
if (defaultExport && renderExport && !defaultExport.render) {
  defaultExport.render = renderExport
}
```

## 验证方式
- 重新打开 Widget 预览，确认 translate-panel 在 payload 为空时仍显示占位 UI。
