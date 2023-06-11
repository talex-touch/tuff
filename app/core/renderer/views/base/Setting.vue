<template>
  <div class="Setting-Container cubic-transition">
    <t-tabs :offset="-33">
      <!--        <t-tab-item disabled icon="home-gear" :name="$t('settings.appearance.home-gear.name')">-->
      <!--          <HomeGear />-->
      <!--        </t-tab-item>-->
      <t-tab-item-group :name="$t('settings.appearance.name')">
        <t-tab-item icon="mark-pen" :name="$t('settings.appearance.theme-style.name')">
          <ThemeStyle />
        </t-tab-item>
        <t-tab-item icon="paint" :name="$t('settings.appearance.paint-custom.name')">
          <PaintCustom />
        </t-tab-item>
      </t-tab-item-group>
<!--      <t-tab-item-group v-if="!dev" name="存储">-->
<!--        <t-tab-item icon="folder-5" name="存储概览" disabled>GOOD,TOUCH</t-tab-item>-->
<!--        <t-tab-item icon="folder-5" name="插件占用" disabled>GOOD,TOUCH</t-tab-item>-->
<!--        <t-tab-item icon="folder-5" name="网络缓存" disabled></t-tab-item>-->
<!--      </t-tab-item-group>-->
<!--      <t-tab-item-group :name="$t('settings.others.name')">-->
<!--        <t-tab-item icon="share" name="也享">-->
<!--          <AlsoShare />-->
<!--        </t-tab-item>-->
<!--        <t-tab-item :non-style="true" icon="node-tree" name="依赖树" disabled>GOOD,TOUCH</t-tab-item>-->
<!--      </t-tab-item-group>-->
      <t-tab-item-group :name="$t('settings.application.name')">
        <t-tab-item activation icon="list-settings" :name="$t('settings.application.list-settings.name')">
          <AppSettings />
        </t-tab-item>
        <t-tab-item icon="tools" :name="$t('settings.application.tools.name')" disabled>HELLO, WORLD!</t-tab-item>
      </t-tab-item-group>
      <t-tab-header>
        <template #default="{ node }">
          <h2>{{ node.props.name }}</h2>
        </template>
      </t-tab-header>
      <template #tabHeader>
        <FlatCompletion :fetch="settingSearch">
          <template #default="{ item }">
            {{ item.name }}
          </template>
        </FlatCompletion>
      </template>
    </t-tabs>
  </div>
</template>

<script name="Setting" setup>
import TTabs from '@comp/tabs/TTabs.vue'
import TTabItem from '@comp/tabs/TTabItem.vue'
import TTabItemGroup from '@comp/tabs/TTabItemGroup.vue'
import TTabHeader from '@comp/tabs/TTabHeader.vue'
import PaintCustom from '~/views/settings/PaintCustom.vue'
import ThemeStyle from '~/views/settings/ThemeStyle.vue'
import AppSettings from '~/views/settings/AppSettings.vue'
import { onMounted, ref } from 'vue'
import { $t } from '@modules/lang'
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";

const dev = ref(false)

onMounted(() => {
  dev.value = process.env.NODE_ENV === 'development'
})

function settingSearch(query) {
  // Rely on the length of query return amo number increasing
  let amo = query.length
  let result = []
  for (let i = 0; i < amo; i++) {
    result.push({
      name: query + i,
      value: amo - i
    })
  }

  return result
}
</script>

<style lang="scss" scoped>
:deep(.FlatInput-Container) {
  --fake-opacity: .45 !important;
}

:deep(.TTabHeader-Container) {
  h2 {
    padding: 0 10px;
  }
}

.Setting-Container {
  position: relative;

  height: 100%;
}
</style>