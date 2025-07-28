# The `Preload.js` script

> Warning! We have moved `InjectionCode` into to the official standard library. So before plugins must introduce our library!

## What's

You can customize a script to start some necessary tasks before loading the extension plug-in, such as pre-server, some operations that need to be pre-processed. But you need to note that after version 2.0.0, your pre-processing operations also need the user’s permission and file declaration to proceed, including but not limited to network services, storage reading, startup programs …

## preload.js

Open your `Plugin Folder` and create a **preload.js** file on the root directory and coding now!

## Install

> Now, we're using official standard library to create bridge between plugins and app.

::: code-group

``` bash [Ni (Recommended)]
ni @talex-touch/utils
```

``` bash [pnpm (Official)]
pnpm install @talex-touch/utils
```

:::

## Reference

``` JavaScript
const { ipcRenderer } = require('electron');
const { init } = require('@talex-touch/utils')
const path = require( 'path' )
const child_process = require( 'child_process' )

// This ensure app to create a bridge
init(window)

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

## Events

As you can see, in the example preload.js, the script uses the @plugin-loaded event, which indicates that the plug-in has been loaded, but the window has not been displayed. At this time, the program has automatically injected some css styles and js code for you. You can directly use the content provided, such as in global.$plugin, or you can also use $crash to handle plug-in crash prompts until the user chooses to close or reload the plug-in, and the process will be repeated.1

You can find a more detailed form <a href="/docs/plugins/api/event" rel="noreferrer">events</a>

<!-- [here](./docs/plugins/api/event) -->

## node-package

You could search the `package.json` of this project and select suitable `node-package` like **child_process、axios、gsap、dayjs...**
