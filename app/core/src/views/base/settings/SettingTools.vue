<script setup lang="ts" name="SettingUser">
import TBlockSlot from "@comp/base/group/TBlockSlot.vue";
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
    const res = window.$shortconApi.regKey(val)

    console.log(res)

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
    <t-block-slot
      title="Shortcon"
      icon="keyboard"
      description="Define your own shortcut and use it anywhere."
    >
      <flat-key-input v-model="key" />
    </t-block-slot>
  </t-group-block>
</template>
