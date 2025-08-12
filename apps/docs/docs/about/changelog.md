# Tuff

## v2.0.0

> 2023/06/??
> 
The new refactoring version `2.0.0` is under developing. Soon will meet with you!

## v1.2.0

> 2023/05/01

### Release Notes for Version 1.2.0

### Bug Fixes

- Fixed the bug where AppUpgradation prompted the update log incorrectly, ensuring that the app can correctly prompt the update log.
- Fixed the layout issue with navbar and plugin-nav-list, ensuring that the website navigation bar and plugin navigation bar are no longer disordered.
- Fixed the positioning issue with TTabs, ensuring that the website can correctly locate the corresponding content when switching tabs.
- Fixed the performance issue with LogTerminal frequently clearing, making LogTerminal operation smoother.
- Fixed the bug with dialog-mention, ensuring that there are no errors when @ someone in the dialog.
- Fixed the issue with Sign series View files, ensuring that the login and registration-related pages can work properly.
- Fixed the bug with lang.ts, fixing some language file-related bugs, and improving the website's multi-language support.

### New Features

- Added IdentifiedIcon, adding a new way to display icons to the website.
- Added Market, including prepared MarketItem and list effects, providing users with a more convenient way to download and manage -plugins.
- Added router files and new plugin view, adding new routes and plugin viewing pages to the website.
- Added TMenuTabs and its sub-components, making router menu switching more reasonable and modern, improving the app design and enhancing the website's user experience.

### Enhancements

- Merged, deleted, and optimized the Components file, making the project structure more beautiful and reducing redundant code and files.
- Refactored the PluginManager part, making the OOP concept more reasonable, fixing many bugs, and adding a reload function.
- Refactored and logically reorganized the index/polyfill root file, also fixing bugs in it.
- Added Platform and PlatformVersion to common-util for enums.
- Refactored the plugin-packager logic, abstracted the code into compress-util, optimized the code logic, added Terminal logs and progress -bars, and refactored the PluginWrapper Vue page to make it more modern and beautiful.
- Optimized some package dependencies.
- Optimized the PluginInfo to make it more modern and beautiful and easier to operate.
-Optimized the UI of PluginApplyInstall and PluginExportMention.
- Optimized the UI of PluginList and PluginListModule.
- Optimized the FileTree.
- Optimized the performance of application-hooks and fixed its bug.
- Optimized the node-api code and removed redundancies.
- Optimized the element style.
- Optimized the Home Market Plugin Setting basic route and structure and fixed the issue with upgrade log display.

### Conclusion

The update fixes various bugs and improves the website's performance, stability, and user experience. New features are added, such as IdentifiedIcon and Market, which provide users with a more convenient way to manage plugins. Enhancements include optimizing the PluginManager, PluginInfo, PluginList, FileTree, application-hooks, node-api code, and element style, making the website more modern and beautiful. Overall, this update provides a better and more stable website for users.

We hope you enjoy the latest version of our software and find the bug fixes, new features, and enhancements beneficial for your workflow. Please feel free to provide feedback or report any issues you encounter. Thank you for your support!

## v1.1.0

> 2023/04/23

### Release Notes for Version 1.1.0

### Bug Fixes

- Fixed numerous bugs - addressed multiple program errors.
- Optimized dynamic effects - improved the visual appearance of dynamic effects.
- Fixed layout issues - corrected problems with the display layout.
- Fixed PluginView layout - resolved issues with ViewWrapper and injection logic, implemented new logic checks to prevent loading failures.
- Fixed TTabs department molecular father style - addressed issues with the styling of TTabs department molecular father.
- Fixed PluginList layout - resolved problems with the layout of PluginList.
- Fixed double prompt bug - addressed issues with double prompts in the user interface.
- Fixed App upgrade information reminder module - resolved problems with the upgrade information reminder module in the App.
- Fixed Plugin installation module bug - addressed issues with the Plugin installation module.
- Fixed touch-plugin link suffix - resolved problems with the touch-plugin link suffix.
- Fixed Plugin parsing module - addressed issues with the Plugin parsing module.
- Fixed App settings statistics - resolved issues with the statistics in the App settings.

### New Features

- Added Plugin Store functionality - including Plugin installation and upgrading modules.
- Added App upgrade information reminder module - providing users with information about software upgrades.
- Added complete input components - including new input options.
- Added export progress - displaying progress information during the export process.
- Added navigation bar icon for Plugin display - showing Plugin functionality in the navigation bar.
- Added website feature introduction - providing users with information about new features on the website.
- Added account functionality - allowing users to manage their accounts within the App.

### Enhancements

- Optimized communication channel - improved the transmission method for communication.
- Optimized layout - improved the overall display layout of the software, including a new blur background effect on MacOS.
- Optimized padding for FlatMarkdown - improved the padding in the FlatMarkdown component.
- Optimized FlatSwitch(TSwitch) animation - enhanced the animation for FlatSwitch(TSwitch).
- Optimized animation for changing router - added animation effects for changing routers.
- Optimized animation for plugin-list - implemented a simplified animation for the plugin-list.
- Optimized PluginView layout - improved the layout of PluginView, including ViewWrapper and injection logic.
- Optimized PluginList layout - enhanced the layout of PluginList.

### Miscellaneous

- Implemented new screen capture feature - allowing users to capture screenshots within the software.
- Added new theme - complete with animation effects.
- Strengthened the overall scaffolding of the project - including the addition of many Vite plugins for auto-imports and setup-extend.
- More commits - made numerous updates and improvements to the software.

We hope you enjoy the latest version of our software and find the bug fixes, new features, and enhancements beneficial for your workflow. Please feel free to provide feedback or report any issues you encounter. Thank you for your support!

## v1.0.0

> 2023/04/19

我们非常高兴地宣布，我们的产品已经更新到最新版本！在这个版本中，我们加入了一些新特性，修复了一些bug，同时也增加了一些新模块和功能。

首先，我们引入了一个插件商店。在这个商店中，您可以方便地搜索、下载、安装和管理各种插件，以实现不同的功能和增强用户体验。我们还修复了一些在之前版本中出现的bug，使得插件的加载和卸载更加稳定和可靠。

另外，我们的导航栏增加了一些新的图标，以帮助您更快地找到并使用您需要的插件。同时，我们还在界面中加入了一些新的链接和后缀，以使得整个产品更加美观和舒适。

除此之外，我们的升级和安装模块也得到了改进。我们增加了一些新的升级信息，以让您更好地了解最新版本的特性和优化。同时，我们还修复了一些之前版本中出现的问题，使得安装和升级的流程更加顺畅和快速。

最后，我们想强调的是，我们的产品仍处于快速迭代期，我们将不断努力提高我们的产品质量和性能，增加更多的新特性和功能，使得用户的使用体验更加愉悦和便捷。同时，我们也欢迎广大开发者和用户们积极参与我们的产品开发和测试，提出您的宝贵意见和建议，一同打造更好的产品！

请您放心使用我们的产品，并期待我们即将发布的2.0.0版本，其中将包含更多强大的功能和更加美观的界面设计，带来更加出色的动效特效。我们预计在接下来的三个月内发布该版本，敬请期待！

### 变更摘要

- 增加插件商店功能，包括插件安装、升级等模块（Pull Request #16）
- 增加 App 升级信息提醒模块（Pull Request #16）
- 修复插件安装模块的 bug（Pull Request #14）
- 增加插件解析模块（Pull Request #14）
- 增加 touch-plugin 的链接后缀（Pull Request #15）
- 实现导航栏图标显示插件功能，并增加网站新特性介绍（Pull Request #13）
- 更新 Layout 模块，修复一些 bug（2023年4月9日提交）
- 增加账户功能并修复相关 bug（2023年4月2日提交）
- 完全更改插件实现方式，包括提示框等功能（2023年3月12日提交）
- 修复两次提示框的 bug 并增加预览功能（2023年2月25日提交）
- 增加 App 设置统计部分并修复一些 bug（2023年2月21日提交）

### 详细变更说明

在 Pull Request #16 中，@TalexDreamSoul 增加了插件商店功能，并添加了插件安装、升级等模块，以及 App 升级信息提醒模块。

在 Pull Request #14 中，@TalexDreamSoul 增加了插件解析模块，并修复了插件安装模块的 bug。

在 Pull Request #15 中，@TalexDreamSoul 增加了 touch-plugin 的链接后缀功能。

在 Pull Request #13 中，@TalexDreamSoul 实现了导航栏图标显示插件功能，并增加了网站新特性介绍。

此外，@TalexDreamSoul 在之前的提交中还修复了一些 bug，包括更新 Layout 模块、增加账户功能并修复相关 bug、完全更改插件实现方式等。其中在 2023年3月12日提交中，完全更改了插件实现方式，包括提示框等功能。

在 2023年2月25日提交中，@TalexDreamSoul 修复了两次提示框的 bug 并增加预览功能。

最后，在 2023年2月21日提交中，@TalexDreamSoul 增加了 App 设置统计部分并修复一些 bug。

### Introduction in English
We are excited to announce that our product has been updated to the latest version! In this version, we have added new features, fixed some bugs, and introduced new modules and functions.

Firstly, we have introduced a plugin store where you can conveniently search, download, install, and manage various plugins to achieve different functions and enhance user experience. We have also fixed some bugs that occurred in previous versions to make plugin loading and unloading more stable and reliable.

In addition, we have added some new icons to our navigation bar to help you quickly find and use the plugins you need. We have also added some new links and suffixes to the interface to make the entire product more beautiful and comfortable.

Furthermore, our upgrade and installation modules have been improved. We have added some new upgrade information to better inform you about the latest features and optimizations in the newest version. At the same time, we have also fixed some issues that occurred in previous versions to make the installation and upgrade process smoother and faster.

Lastly, we would like to emphasize that our product is still in a fast iteration period, and we will continue to work hard to improve the quality and performance of our product, add more new features and functions, and make the user experience more pleasant and convenient. We also welcome developers and users to actively participate in our product development and testing, and provide your valuable opinions and suggestions to create a better product together!

Please feel free to use our product and look forward to our upcoming 2.0.0 version, which will contain more powerful features and more beautiful interface designs with fantastic animations. We expect to release this version in the next three months, so stay tuned!

### What's Changed
* Change\<Many\>: New features about navbar(icons for plugins) and new we… by @TalexDreamSoul in https://github.com/tuff/tuff/pull/13
* Module\<Plugin\>: Add plugin resolver modules by @TalexDreamSoul in https://github.com/tuff/tuff/pull/14
* Add\<Link\>: Link suffix of touch-plugin by @TalexDreamSoul in https://github.com/tuff/tuff/pull/15
* Plugin store by @TalexDreamSoul in https://github.com/tuff/tuff/pull/16

### New Contributors

* @TalexDreamSoul made their first contribution in https://github.com/tuff/tuff/pull/13

**Full Changelog**: https://github.com/tuff/tuff/compare/SNAPSHOT...STARTED