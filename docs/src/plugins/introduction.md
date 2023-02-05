# 如何开发拓展插件

## 简述

TalexTouch 仅仅是一个框架的壳子，您可以为他添砖加瓦。 当程序运行时，将自动在运行目录下创建 **talex-touch/plugins** 文件夹，在这里新建您需要的插件文件夹，并且提供 **index.html** 与 **init.json** 两个文件 使插件能够被加载！

> 尤其提醒：您的 **插件文件夹名字** 必须和 **init.json** 中的 **name字段** 相同，且不能包含 **talex/touch** 的全称，否则将会被程序禁止！

## 参考文件

::: code-group

``` html [index.html]
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';" />
    <title>TalexTouch</title>
  </head>
  <body>
    <div id="touch">Hello, Touch!</div>
  </body>
</html>
```


``` JSON [init.json]
{
  "name": "plugin-demo",
  "version": "1.0.0-Alpha",
  "icon": {
    "type": "remix",
    "value": "github"
  },
  "description": "我的第一款测试插件",
  "authors": [
    {
      "name": "Tds",
      "email": "TalexDreamSoul@Gmail.com",
      "website": "https://www.github.com/TalexDreamSoul",
      "introduction": "Developer",
      "local": "China ChengDu",
      "position": "Major author"
    }
  ],
  "plugin": {
    "signature": "TALEX-TOUCH-DEMO"
  }
}
```

:::

现在，重启您的程序或在插件设置中刷新即可看到您的插件了，如果不出意外您的插件图标应该是 GitHub 的 logo