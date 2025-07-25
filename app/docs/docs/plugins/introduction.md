# Extension Plugin

## What's

`TalexTouch` just a shell of the frame, you can do whatever you want do by developing plugins.

When the program is running, the directory `talex-touch` will be automatically create. Click `Plugins` and click `+ Create One` to create a plugin, the environment will be automatically established by app.

Just provide `index.html` `init.json`(will be exported as **manifest.json**) to ensure the plugin will be loaded!

> Please note that your `plugin name` must same as the field `name` in `init.json` and must not contains any in **talex/touch** or will be disabled!

## Reference

::: code-group

``` html [index.html]
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';" />
    <title>Notepad Demo</title>
  </head>
  <body>
    <div id="touch">Hello, Touch!</div>
  </body>
</html>
```

``` JSON [init.json]
{
  "name": "plugin-demo",
  "version": "1.0.0",
  "icon": {
    "type": "remix",
    "value": "notepad"
  },
  "description": "My notepad extension plugin.",
}
```

:::

Now, when you put the plugin folder inside, he will be applied automatically read and loaded.

And, because you are automatically created by the app, so will comes with a default value, when you modify the content(`init.json` or `index.html` or `preload.js` or `README.md`) and save then, the plugin will be automatically according to the need to reload.

## Plugin Launch Context

Your plugin page can be opened from different contexts:
- **Main page**: Launched from the main application interface
- **Core-box page**: Launched from the core-box interface

You need to determine the launch context through the parameters passed to your plugin (todo+beta feature).

## Plugin Activation Requirements

**Important**: Your plugin page can only be opened when it is enabled. If the plugin is disabled, access will be denied.

However, the `preload.js` execution timing remains the same regardless of the plugin's enabled state.

**Note**: Your plugin will only load when the user manually starts it, regardless of other conditions.

## Got it

You just complete this section, and click `Next Section` to learn more.
