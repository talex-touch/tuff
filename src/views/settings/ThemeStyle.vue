<template>
  <t-group-switch :expand-fill="true" name="个性化" icon="t-shirt" description="图片背景模糊有可能会受到插件的更改">
<!--    <t-block-switch v-model="options.dark" title="暗黑模式" description="为应用整体映射暗色风格" icon="moon">-->
      <t-group-switch name="个性化" icon="moon" description="为应用整体映射暗色风格">
        <t-block-switch :disabled="options.autoDark" v-model="options.dark" title="启用" description="是否启用应用暗黑模式" icon="moon" />
        <t-block-switch v-model="options.autoDark" title="自动" description="跟随系统切换暗黑模式" icon="exchange" />
      </t-group-switch>
<!--    </t-block-switch>-->
    <t-block-switch v-model="options.blur" title="透明引擎" description="为应用整体映射模糊透明，背景模糊仅支持Windows操作系统" icon="drop"></t-block-switch>
  </t-group-switch>

  <t-group-switch :expand-fill="true" name="强调" icon="record-circle" description="不同的强调模式适用于不同人群，若着色清晰不推荐启用">
    <t-block-switch v-model="options.coloring" title="主色着色" description="为插件窗口进行主要颜色的着色" icon="contrast-drop-2" />
    <t-block-switch disabled v-model="options.contrast" title="高对比度" description="适用于弱视和强光敏感的对比度模式" icon="contrast" />
  </t-group-switch>

  <t-block-switch guidance title="主题帮助" description="在官方Github-Discussions上查找主题帮助" icon="search-2" />
</template>

<script>
export default {
  name: "ThemeStyle"
}
</script>

<script setup>
import TGroupSwitch from '@comp/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/switch/TBlockSwitch.vue'
import TBlockSelect from '@comp/select/TBlockSelect.vue'
import TSelectItem from '@comp/select/TSelectItem.vue'

const options = window.$storage.themeStyle

</script>

<style scoped>

</style>