## Layouts

该目录中的 Vue 组件用作布局.

默认情况下，除非在路由元中指定了替代方案，否则将使用“default.vue”.

```vue
<script setup lang="ts">
definePageMeta({
  layout: 'home',
})
</script>
```

Learn more on https://nuxt.com/docs/guide/directory-structure/layouts
