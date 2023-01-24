<template>
  <div class="Setting-Container">
    <t-tabs v-model="tabSelection">
      <t-tab-item-group name="外观">
        <t-tab-item icon="home-gear" name="启动页面">
          <HomeGear />
        </t-tab-item>
        <t-tab-item icon="mark-pen" name="主题风格">
          <ThemeStyle />
        </t-tab-item>
        <t-tab-item icon="paint" name="个性定制">
          <PaintCustom />
        </t-tab-item>
      </t-tab-item-group>
      <t-tab-item-group name="存储">
        <t-tab-item icon="folder-5" name="存储概览" disabled>GOOD,TOUCH</t-tab-item>
        <t-tab-item icon="folder-5" name="插件占用" disabled>GOOD,TOUCH</t-tab-item>
        <t-tab-item icon="folder-5" name="网络缓存" disabled></t-tab-item>
      </t-tab-item-group>
      <t-tab-item-group name="其它">
        <t-tab-item :non-style="true" icon="node-tree" name="依赖树" disabled>GOOD,TOUCH</t-tab-item>
      </t-tab-item-group>
      <t-tab-item-group name="应用">
        <t-tab-item icon="list-settings" name="应用设置">
          <AppSettings />
        </t-tab-item>
        <t-tab-item icon="tools" name="高级设置" disabled>HELLO, WORLD!</t-tab-item>
      </t-tab-item-group>
      <t-tab-header>
        <template #default="{ node }">
          <h2>{{ node.props.name }}</h2>
        </template>
      </t-tab-header>
    </t-tabs>
  </div>
</template>

<script>
export default {
  name: "Setting"
}
</script>

<script setup>
import TTabItem from '@comp/tabs/TTabItem.vue'
import TTabItemGroup from '@comp/tabs/TTabItemGroup.vue'
import TTabHeader from '@comp/tabs/TTabHeader.vue'
import PaintCustom from '~/views/settings/PaintCustom.vue'
import ThemeStyle from '~/views/settings/ThemeStyle.vue'
import HomeGear from '~/views/settings/HomeGear.vue'
import TSelect from '@comp/select/TSelect.vue'
import TSelectItem from '@comp/select/TSelectItem.vue'
import AppSettings from '~/views/settings/AppSettings.vue'
import { ref } from 'vue'

const tabSelection = ref("应用设置")
</script>

<style lang="scss" scoped>
.Setting-Container {
  position: relative;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}

:deep(.TTabHeader-Container) {
  h2 {
    padding: 0 10px;
  }
}

</style>