# Extension Plugin

## What's

`TalexTouch` is just a shell of the frame, you can do whatever you want to do by developing plugins.

When the program is running, the directory `talex-touch` will be automatically created. Click `Plugins` and click `+ Create One` to create a plugin, the environment will be automatically established by app.

Just provide `index.html` `init.json`(will be exported as **manifest.json**) to ensure the plugin will be loaded!

> Please note that your `plugin name` must same as the field `name` in `init.json` and must not contain any in **talex/touch** or will be disabled!

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

## Got it

You just complete this section, and click `Next Section` to learn more.
