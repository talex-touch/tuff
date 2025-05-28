<script setup lang="ts" name="SettingUser">
import TBlockSlot from "@comp/base/group/TBlockSlot.vue";
import TBlockSwitch from "~/components/base/switch/TBlockSwitch.vue";
import TBlockSelect from "~/components/base/select/TBlockSelect.vue";
import TSelectItem from "~/components/base/select/TSelectItem.vue";
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import FlatKeyInput from "~/components/base/input/FlatKeyInput.vue";
import { storageManager } from "~/modules/channel/storage/index.ts";

defineProps({
  env: {
    type: Object,
    required: true,
  },
});

const key = ref(storageManager.appSetting.keyBind.summon);

watch(
  () => key.value,
  (val) => {
    const res = window.$shortconApi.regKey(val);

    console.log(res);

    storageManager.appSetting.keyBind.summon = val;
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
      v-model="storageManager.appSetting.beginner.init"
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
      v-model="storageManager.appSetting.tools.autoPaste.time"
      title="Auto paste"
      icon="checkbox-multiple-blank"
      description="Paste what you copied in searchbar."
    >
      <t-select-item name="-1">Disabled</t-select-item>
      <t-select-item name="0">No limit</t-select-item>
      <t-select-item name="15">15 sec</t-select-item>
      <t-select-item name="30">30 sec</t-select-item>
      <t-select-item name="60">1 min</t-select-item>
      <t-select-item name="180">3 min</t-select-item>
      <t-select-item name="300">5 min</t-select-item>
      <t-select-item name="600">10 min</t-select-item>
      <t-select-item name="750">15 min</t-select-item>
    </t-block-select>
    <t-block-select
      v-model="storageManager.appSetting.tools.autoClear"
      title="Auto clear"
      icon="format"
      iconChange="clear"
      description="Clear searchbar after box hidden."
    >
      <t-select-item name="-1">Disabled</t-select-item>
      <t-select-item name="0">No limit</t-select-item>
      <t-select-item name="15">15 sec</t-select-item>
      <t-select-item name="30">30 sec</t-select-item>
      <t-select-item name="60">1 min</t-select-item>
      <t-select-item name="180">3 min</t-select-item>
      <t-select-item name="300">5 min</t-select-item>
      <t-select-item name="600">10 min</t-select-item>
      <t-select-item name="750">15 min</t-select-item>
    </t-block-select>
  </t-group-block>
</template>
