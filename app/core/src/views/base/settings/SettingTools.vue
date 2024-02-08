<script setup lang="ts" name="SettingUser">
import TBlockSlot from "@comp/base/group/TBlockSlot.vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";

defineProps({
  env: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <t-group-block
    name="Utilities"
    icon="account-box"
    description="Practical tools provide a unified fast desktop arbitrary promoter for you to use."
  >
    <t-block-slot
      title="Shortcon"
      icon="account-circle"
      description="Define your own shortcut and use it anywhere."
    >
      READY
    </t-block-slot>
  </t-group-block>
</template>
