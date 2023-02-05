# 拓展插件的前置脚本

## 简述

您可以通过自定义一个脚本，在加载拓展插件之前启动一些必要任务，譬如 前置的服务器、一些需要预处理的操作。 但是需要注意的是，在版本 **2.0.0** 以后，您的预处理操作同时需要用户的许可和文件的声明才可进行，包括但不限于 网络服务、存储读取、启动程序 ....

## preload.js

打开您的插件文件夹，在 init.json 同目录创建文件 preload.js ，然后您即可自由发挥。

## 一个参考的 preload.js

``` JavaScript
const { ipcRenderer } = require('electron');
const path = require( 'path' )
const child_process = require( 'child_process' )

ipcRenderer.once('@plugin-loaded', () => {
  setTimeout(async() => {

    const { $plugin: plugin } = global

    console.log("Plugin loaded!", plugin)

    const apiServer = window.$server = child_process.fork(path.resolve(plugin.path.relative, "api", "app.js"), {
      cwd: path.join(plugin.path.relative, "api"),
    })

    console.log("Plugin Show!")

  })
})
```

## 事件

如您所见，在示例的 preload.js 中，脚本使用了 @plugin-loaded 事件，此事件表明 插件已被加载，但是窗口还未显示，此时程序已为您自动注入需要的一些 css样式 和 js代码，您可以直接使用提供的内容，譬如 global.$plugin 中的，或者您也可以使用 $crash 进行插件崩溃提示处理，直到用户选择 关闭或者重载 插件，将会重复流程。

目前提供的事件有 @plugin-loaded 和 @plugin-show 事件等，后者在窗口 **每次** 显示后触发。关于更详细的事件表格，您可以查询[这里](./plugins/api/event)

## node-package

您可以通过查询本项目的 package.json 选择自带的可用的 node 包，譬如 child_process、axios、gsap、dayjs 等。