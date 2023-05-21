# Hello

## 前言

在这里编写你的内容吧

示例代码

```ts
const getType = (target: unknown): string => {
  return Object.prototype.toString.call(target)
}
```

## 官方资源

- [vitepress 文档](https://vitepress.vuejs.org)
- [仓库地址](https://github.com/vuejs/vitepress)

## 组件库使用

以 [Fighting Design](https://github.com/FightingDesign/fighting-design) 为演示

<f-button type="primary">主要按钮</f-button>
<f-button type="success" ripples>涟漪效果</f-button>
<f-button type="warning" ripples>点我试试</f-button>
<f-button type="danger" ripples simple>看看我</f-button>
<f-button type="success" text ripples ripples-color="green">
自定义涟漪颜色
</f-button>

## 贡献者

该仓库由 [Tyh2001](https://github.com/Tyh2001) 提供。

![](https://tianyuhao.cn/images/auto/weixin.png)

## 静态资源

![](/images/bug.jpg)

## 表格示例

| 参数         | 说明               | 类型            | 可选值                                           | 默认值  |
| ------------ | ------------------ | --------------- | ------------------------------------------------ | ------- |
| `type`       | 类型               | string          | `default` `primary` `success` `danger` `warning` | default |
| `font-size`  | 副标题文字大小     | string / number | ——                                               | 15px    |
| `title-size` | 主标题文字大小     | string / number | ——                                               | 17px    |
| `bold`       | 文字是否以粗体显示 | boolean         | ——                                               | false   |
| `center`     | 是否居中           | boolean         | ——                                               | false   |
