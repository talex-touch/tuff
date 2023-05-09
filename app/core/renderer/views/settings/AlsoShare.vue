<template>
  <div class="AlsoShare-Container">
    <div class="AlsoShare-Content">
      <device-figure />
    </div>

    <t-group-block name="共享" icon="share-box" description="跨设备数据共享">
      <t-group-block :shrink="true"  name="插件同步" icon="plug-2" description="插件跨设备同步">
        <t-block-select v-model="options.plugin.sync" title="插件同步" icon="plug-2" description="同步插件数据">
          <t-select-item>永不同步</t-select-item>
          <t-select-item>黑名单模式</t-select-item>
          <t-select-item>白名单模式</t-select-item>
        </t-block-select>
        <t-block-switch title="保持最新" icon="refresh" v-model="options.plugin.syncLatest" description="保持各个设备插件均为最新" />
        <t-block-switch title="数据同步" icon="refresh" v-model="options.plugin.dataSync" description="若相关插件未适配，不同设备间数据可能会冲突" />
      </t-group-block>
      <t-group-block :shrink="true" name="剪贴板同步" icon="clipboard" description="剪贴板跨设备同步">
        <t-block-select v-model="options.plugin.sync" title="剪贴板同步" icon="clipboard" description="同步剪贴板数据">
          <t-select-item>永不同步</t-select-item>
          <t-select-item>黑名单模式</t-select-item>
          <t-select-item>白名单模式</t-select-item>
        </t-block-select>
        <t-block-switch title="自动转换" icon="refresh" v-model="options.plugin.syncLatest" description="自动转换剪贴板数据以适配不同设备" />
      </t-group-block>

      <t-block-switch title="隐私" icon="shield" guidance description="获取数据保护和隐私保护的有关信息"  model-value/>

    </t-group-block>
  </div>
</template>

<script>
export default {
  name: "AlsoShare"
}
</script>

<script setup>
import DeviceFigure from '@comp/device/DeviceFigure.vue'
import TBlockSwitch from '@comp/base/switch/TBlockSwitch.vue'
import TSelectItem from '@comp/base/select/TSelectItem.vue'
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import TBlockSelect from "@comp/base/select/TBlockSelect.vue";

const options = window.$storage.appSetting
</script>

<style lang="scss" scoped>
.AlsoShare-Content {
  position: relative;
  margin-bottom: 15px;

  width: 100%;
  height: 40%;

  border-radius: 8px;
  background-color: var(--el-fill-color-light);
}

.AlsoShare-Container {
  position: relative;

  width: 100%;
  height: 100%;
}
</style>