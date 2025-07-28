<script setup lang="ts" name="SettingUser">
import TBlockSlot from "@comp/base/group/TBlockSlot.vue";
import TBlockSwitch from "~/components/base/switch/TBlockSwitch.vue";
import TBlockSelect from "~/components/base/select/TBlockSelect.vue";
import TSelectItem from "~/components/base/select/TSelectItem.vue";
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import FlatKeyInput from "~/components/base/input/FlatKeyInput.vue";
import { appSetting } from "~/modules/channel/storage/index.ts";

defineProps({
  env: {
    type: Object,
    required: true,
  },
});

const key = ref(appSetting.keyBind.summon);

watch(
  () => key.value,
  (val) => {
    // 第二个参数是回调函数
    const res = window.$shortconApi.regKey(val, () => {
      console.log('Shortcut triggered:', val);
    });

    console.log(res);

    appSetting.keyBind.summon = val;
  }
);
</script>

<template>
  <t-group-block
    name="Utilities"
    icon="suitcase"
    description="Practical tools provide a unified fast desktop arbitrary promoter for you to use."
  >
    <t-block-switch
      v-model="appSetting.beginner.init"
      title="Usage"
      icon="book-2"
      description="Guide you to use app when enter."
    />
    <t-block-slot
      title="Shortcon"
      icon="keyboard"
      description="Define your own shortcut and use it anywhere."
    >
      <flat-key-input v-model="key" />
    </t-block-slot>
    <t-block-select
      v-model="appSetting.tools.autoPaste.time"
      title="Auto paste"
      icon="checkbox-multiple-blank"
      description="Paste what you copied in searchbar."
    >
      <t-select-item :modelValue="-1">Disabled</t-select-item>
      <t-select-item :modelValue="0">No limit</t-select-item>
      <t-select-item :modelValue="15">15 sec</t-select-item>
      <t-select-item :modelValue="30">30 sec</t-select-item>
      <t-select-item :modelValue="60">1 min</t-select-item>
      <t-select-item :modelValue="180">3 min</t-select-item>
      <t-select-item :modelValue="300">5 min</t-select-item>
      <t-select-item :modelValue="600">10 min</t-select-item>
      <t-select-item :modelValue="750">15 min</t-select-item>
    </t-block-select>
    <t-block-select
      v-model="appSetting.tools.autoClear"
      title="Auto clear"
      icon="format"
      iconChange="clear"
      description="Clear searchbar after box hidden."
    >
      <t-select-item :modelValue="-1">Disabled</t-select-item>
      <t-select-item :modelValue="0">No limit</t-select-item>
      <t-select-item :modelValue="15">15 sec</t-select-item>
      <t-select-item :modelValue="30">30 sec</t-select-item>
      <t-select-item :modelValue="60">1 min</t-select-item>
      <t-select-item :modelValue="180">3 min</t-select-item>
      <t-select-item :modelValue="300">5 min</t-select-item>
      <t-select-item :modelValue="600">10 min</t-select-item>
      <t-select-item :modelValue="750">15 min</t-select-item>
    </t-block-select>
    <t-block-switch
      v-model="appSetting.tools.autoHide"
      title="Auto hide"
      icon="search-eye"
      description="Hide searchbar when blur triggered."
    />
  </t-group-block>
</template>
