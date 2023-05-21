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

Now, click button `Refresh` to list your plugin on `PluginList` and if no accident your `plugin icon` should be a notepad icon.

## Got it

You just complete this section, and click `Next Section` to learn more.
