<script setup lang="ts">
import FlatInput from "./FlatInput.vue";
import { useVModel } from "@vueuse/core";

const props = defineProps<{
  modelValue: String;
}>();
const emits = defineEmits<{
  (e: "update:modelValue", val: String): void;
}>();

const model = useVModel(props, "modelValue", emits);

function startRecord(e: KeyboardEvent) {
  e.preventDefault();

  let extraKey = e.key;

  if (extraKey === " ") extraKey = "space";
  else if (extraKey === "`") extraKey = "Backquote";
  else if (extraKey === ".") extraKey = "NumpadDecimal";
  else if (extraKey === "\\") extraKey = "Backslash";
  else if (extraKey === "=") extraKey = "Equal";
  else if (extraKey === "-") extraKey = "Minus";

  if (e.altKey && extraKey !== "altKey") extraKey = "alt + " + extraKey;
  else if (e.ctrlKey && extraKey !== "ctrlKey") extraKey = "ctrl + " + extraKey;
  else if (e.metaKey && extraKey !== "Meta") extraKey = "meta + " + extraKey;
  else if (e.shiftKey && extraKey !== "Shift") extraKey = "shift + " + extraKey;

  setTimeout(() => (model.value = extraKey.toLocaleUpperCase()), 10);
}
</script>

<template>
  <FlatInput tabindex="0" @keydown="startRecord" v-model="model" />
</template>
