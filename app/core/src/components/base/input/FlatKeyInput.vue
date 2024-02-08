<script setup lang="ts">
import FlatInput from "@/components/flat/FlatInput.vue";
import Mousetrap from "mousetrap";

const props = defineProps<{
  modelValue?: boolean;
}>();

const model = ref();
</script>

<template>
  <FlatInput v-model="model" />
</template>
