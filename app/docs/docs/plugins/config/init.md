# init.json

> init.json is a vital configuration that app identifies a completely plugin.
> Here is a demo and descriptions.

::: code-group

``` JSON [Whole]
{
  "name": "demo-plugin",
  "version": "1.0.0",
  "icon": {
    "type": "remix",
    "value": "github"
  },
  "description": "This is a demo.",
  "plugin": {
    "dev": {
	  "enable": true,
	  "address": "http://127.0.0.1:5174/"
	}
  }
}
```

``` JSON [Simplified]
{
  "name": "demo-plugin"
}
```

:::

## name

Filed `name` identifies the name of a plugin, you are supposed to ensure it equals to your `Plugin Folder` or the app will deny to run it.
If there has multiple same name plugins, the program will deny all.

## version <Badge type="info" text="Optional" /> <Badge type="warning" text="Supposed" />

Field `version` identifies the version of a plugin, if it's empty, the default will be `1.0.0` and it shows that your plugin could not finish self-upgrading.
Here is a recommended [document](https://semver.org/) to refer.

## icon <Badge type="info" text="OPTIONAL" /> <Badge type="warning" text="Supposed" />

Filed `icon` identifies the icon of a plugin, if it's empty, the default will be `TalexTouch` Logo, it will seriously affect the user's identification in the plug-in

<br />
<br />

> Here are 2 fileds under icon filed.

### type <Badge type="info" text="OPTIONAL" />

`Filed icon.type` identifies the icon type of a plugin-icon. You can use [RemixIcon](https://remixicon.com/) value if you set it to `remix`

> Other contents will be searched from **plugin-root-folder/value** , try to not more than 1 MB.

It is important to note that you do not need to fill out the prefix remix and style style, such as line, although style can fill in the category, such as remix - making - and only fill in making the line!

## value <Badge type="info" text="OPTIONAL" /> <Badge type="warning" text="Supposed" />

`Filed icon.value` identifies the value of a plugin-icon. If it's empty, the default will be `TalexTouch` Logo.

## plugin <Badge type="info" text="OPTIONAL" />

> Here are many things under plugin filed.

### dev <Badge type="danger" text="Beta" />

Filed `dev` identifies the dev-mode of a plugin, you can use `enable` to enable or disable.

- address: Where to load page
- source: Use confusion when exporting. <Badge type="danger" text="Beta" />
