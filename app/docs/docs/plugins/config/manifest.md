# Manifest

> `manifest.json` is our newly design that not need you manually manage configuration.

## Introduction

In the latest `2.0.0+`, we abandoned `init.json` but it still support in loading plugin.

We take measures on `manifest.json`, a configuration which you don't need to manage it manually!
Just take config into `package.json`, the manifest and whole pack will be automatically packed when you build!

## Get Started

To start it, install our official unplugin in your project.
The `ni` is recommended to install any libs.

Here is a quick avenue to see the latest version of it: [![NPM version](https://img.shields.io/npm/v/@talex-touch/unplugin-export-plugin?color=a1b858&label=)](https://www.npmjs.com/package/unplugin-starter)

``` bash
ni -D @talex-touch/unplugin-export-plugin
```

### Vite

In your `vite.config.js` or `vite.config.ts`

``` ts
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'

export default defineConfig({
  plugins: [
    ....,
    TouchPluginExport()
  ],
})
```

### Other build tool

You can refer to [this](https://github.com/unjs/unplugin) to know more about it.

## Appendix

In the newly manifest file, we abandoned many fields.

And here is a completely demo.

Just remove `name` `version` `description` (They will auto imported from **package.json**)

Other fields are all moved to the `touch` filed in **package.json**

Other fields as normal.

``` JSON [Whole]
package.json
{
  ...,
  "touch": {
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
    },
    "build": {}
  }
}
```

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
