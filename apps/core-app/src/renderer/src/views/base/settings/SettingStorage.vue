<script setup lang="ts" name="SettingUser">
import { useRouter } from 'vue-router';
import TBlockSwitch from "~/components/base/switch/TBlockSwitch.vue";

const router = useRouter()
</script>

<template>
  <t-block-switch
  v-wave
      guidance
      title="Storage"
      description="
        View app storage details
      "
      icon="file-2"
      @click="router.push('/setting/storage')"
    />
</template>
