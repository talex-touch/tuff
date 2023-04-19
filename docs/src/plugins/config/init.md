# init.json

> init.json 是识别一个插件的重要配置文件，以下将会给出一个完整的示例，并逐一讲解。

::: code-group

``` JSON [完整示例]
{
  "name": "demo-plugin",
  "version": "1.0.0-Alpha",
  "icon": {
    "type": "remix",
    "value": "github"
  },
  "description": "This is a demo.",
  "plugin": {
    "signature": "demo-signature",
    "dev": {
	  "enable": true,
	  "address": "http://127.0.0.1:5174/",
	  "source": true
	}
  }
}
```

``` JSON [最简示例]
{
  "name": "demo-plugin"
}
```

:::

## name
name字段标识一个插件的名称，在开发阶段您需要确保 name 字段与 插件文件夹名字 相同，否则应用会拒绝加载。当多个插件名称相同时，程序会**全部拒绝运行**

## version <Badge type="info" text="可选" /> <Badge type="warning" text="建议填写" />
version字段标识一个插件的版本，如果您不填写将默认为 1.0.0 这也标示着您的插件无法完成自动更新，必须用户手动替换，因此建议您参考 [语义化版本模型](https://semver.org/) 进行设定。

## icon <Badge type="info" text="可选" /> <Badge type="warning" text="建议填写" />
icon字段标识一个插件的图标，如果您不填写将默认为插件的logo， 这将严重影响到用户对插件的辨识程度。
<br />
<br />

> 在 icon 字段下分属两个子字段

### type <Badge type="info" text="可选" />
type字段标识插件图标的类型，填写 remix 时表示应用自带的图标库，可以在[这里](https://remixicon.com/)查找相关的 value

> 填写任意其它内容均会从 **插件根目录/value** 进行读取文件，不建议过大，建议 32*32 / 64*64

值得注意的是，您不需要填写前缀 remix 以及样式风格，诸如 line，尽管填写类别样式即可，譬如 remix-github-line 仅需填写 github 即可！

## description <Badge type="info" text="可选" /> <Badge type="warning" text="建议填写" />
icon字段标识一个插件的简介，如果您不填写将严重影响用户对插件的了解程度。

## plugin <Badge type="info" text="可选" />
> plugin旗下具有诸多内容

### signature <Badge type="danger" text="Beta" />
signature字段表示一个插件的加密密钥，在打包时若没有将会自动生成，如果有的话将进行使用。

### dev <Badge type="danger" text="Beta" />
dev字段表示一个插件的调试情况，通过 enable 进行启用或关闭。

#### address表示 dev模式 时将从哪里加载页面

<br />

#### source 表示 dev模式 时是否允许查看源码 <Badge type="danger" text="Beta" />