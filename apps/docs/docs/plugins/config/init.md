# init.json

## Announcement

Now we don't use `init.json` in product env any more.
See [Manifest](./manifest.md) for more!

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

> Here are 2 fields under icon filed.

### type <Badge type="info" text="OPTIONAL" />

`Filed icon.type` identifies the icon type of a plugin-icon. You can use [RemixIcon](https://remixicon.com/) value if you set it to `remix`

> Other contents will be searched from **plugin-root-folder/value** , try to not more than 1 MB.

It is important to note that you do not need to fill out the prefix remix and style style, such as line, although style can fill in the category, such as remix - making - and only fill in making the line!

## value <Badge type="info" text="OPTIONAL" /> <Badge type="warning" text="Supposed" />

Filed `icon.value` identifies the value of a plugin-icon. If it's empty, the default will be `TalexTouch` Logo.

## plugin <Badge type="info" text="OPTIONAL" />

> Here are many things under plugin filed.

### dev <Badge type="danger" text="Beta" />

Filed `dev` identifies the dev-mode of a plugin, you can use `enable` to enable or disable.

- address: Where to load page
- source: Use confusion when exporting. <Badge type="danger" text="Beta" />

### build

> To export your plugin, you must have a build field.

The build field is made up with 2 vital fields with other optional fields.

Here is a completely demo:

``` JSON
"build": {
  "files": [
    "init.json",
    "index.html"
  ],
  "secret": {
    "pos": "TalexTouch",
    "addon": [
      "windows",
      "darwin",
      "linux"
    ]
  },
  "verify": {
    "enable": true,
    "online": "always"
  },
  "version": {
    "update": "auto",
    "downgrade": false
  }
}
```

As you see above, the build field is consists of 4 fields.

#### files (Necessary)

`Field files` describes the files what you want to export!
Attention, the `OFFICIAL` upload limit is 512MB and single plugin size limit is `2048MB`

The export root path is your plugin root path.

#### secret (Necessary)

`Field secret` describes the secret that you want to choose.

If you want to upload your plugin to `OFFICIAL` you must choose pos **TalexTouch**

Otherwise you could choose your own secret url! (Up to your deploy method)

`Field addon` describes what platforms you want to release.

The platform that not match could not load it.

#### verify (Optional)

`Field verify` describes the plugin whether should be verified.

It means if you turn on it, the plugin must be connected to Internet and be validated to use.
(It's a necessary switch if you want user use by payment)

`Field online` describes the validation method

For **custom**: Up to developer to choose (See docs)
For **always**: Plugin need to validate on each startup
For **once**: Plugin need to validate on computer startup

#### version (Optional)

`Field update` describes the plugin update method.

For **auto**: When new version released, the plugin will be automatically update when startup.
For **ask**: Ask user whether to update.
For **readable**: Deprecated the plugin, user could only use and no later version.

`Field downgrade` describes the user could downgrade their plugin to this version.

For more about it, you can see our source-code on right corder (GitHub)
