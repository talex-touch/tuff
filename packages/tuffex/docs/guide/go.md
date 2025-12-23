# 开发攻略

### 1、修改环境变量

`./.env`文件下

```
# CSS预处理器 默认支持sass和less
CSS_PREPROCESSOR = 'scss'
# 用于添加组件命名前缀，建议采用首字母大写格式，最后生成的组件会变成<vc-button></vc-button>这种格式
COMPONENT_NAME = 'Vc'
```



### 2、创建约定文件

建议运行 `pnpm component:create [组件名]`命令来创建组件开发需要用到的文件。



详细介绍上述这条命令做了哪些操作（以创建button组件为例）：

```
├─packages
|    ├─components
|    |     ├─style
|    |     |   └index.scss			   // 自动引入'button/src/style/index.scss'的样式，作为全局样式
|    |     ├─src
|    |     |  ├─components.ts          // 自动引入'button/src/index.ts'导出的组件
|    |     |  ├─index.ts
|    |     |  ├─button
|    |     |  |   ├─index.ts           // 自动引入src下的组件，并且对组件进行注册
|    |     |  |   ├─src				   // 自动创建组件开发使用到的文件
|    |     |  |   |  ├─button.vue
|    |     |  |   |  ├─style
|    |     |  |   |  |   └index.scss
├─docs
|  ├─guide
|  |   ├─components
|  |   |     └button.md					// 自动创建组件文档说明需要的文件
```

- 我们在组件开发的过程中只需要关注 `button/src` 下文件的编写。
- 在编写说明文档的时候只需要关注 `docs/guide/components/`下的文档内容。



### 3、组件测试

vuecomp-starter已经帮助全局引入packages下的组件，我们只需要在文档中直接编写就可以看到组件。

也可以使用内置的测试环境对组件进行测试，我们已经对运行环境做了约定式路由处理，直接在pages下创建文件就可以自动映射对应的路由，类似于Nuxt。