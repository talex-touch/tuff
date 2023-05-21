
|   插件译名解释   |     事件名称     |                           触发时机                           |
| :--------------: | :--------------: | :------------------------------------------------------: |
|  Plugin Loaded  |  @plugin-loaded  |      If and only if the plugin is loaded for the first time, including overloading, reload after unloading, etc      |
|  Window Displayed  |   @plugin-show   | If and only if each window display, for example from enabled status to active status, or by other plug-ins intend/mini - intend to jump to open |
|  Plugin Disabled  | @plugin-unloaded | Every time if and only if the plugin is unloaded calls, will cancel the loading plug-ins and removed from pluginList from |
