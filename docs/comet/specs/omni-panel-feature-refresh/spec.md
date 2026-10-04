# OmniPanel Feature Refresh

本规格描述 OmniPanel 窗口如何得知主进程的功能清单发生了变化。

## 投递

- 主进程的 omni-panel 模块在功能清单变化时发出 `omniPanelFeatureRefreshEvent`，载荷包含原因和清单更新时间。变化包括插件注册或移除功能、内置动作增删、本机代理总开关切换等。
- OmniPanel 是独立窗口。刷新事件必须**点对点发给 OmniPanel 窗口**；窗口不存在或已销毁时跳过，不报错。
- `TuffMainTransport.broadcast` 只发给主窗口，它的注释如实写明这一点。需要送达其他窗口的事件，使用按窗口发送的接口。
- OmniPanel 收到刷新后重新读取功能清单，并重新判断「交给本机代理」动作是否应当出现。打开期间的列表随之更新，不需要关闭重开。

### Scenario: list follows the master switch while open

Acceptance: A5

WHEN OmniPanel 处于打开状态，用户在设置里切换本机代理总开关，THEN OmniPanel 的动作列表随之出现或去掉「交给本机代理」，不需要关闭重开。
