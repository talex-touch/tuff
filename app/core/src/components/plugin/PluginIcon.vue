<script lang="ts" name="PluginIcon" setup>
import RemixIcon from "@comp/icon/RemixIcon.vue";
import { forTouchTip } from "~/modules/mention/dialog-mention";

const props = defineProps<{
  icon: {
    type: string;
    value: string | Buffer;
    _value: string;
  };
  alt: string;
}>();

interface IIconOption {
  type: "remix" | "class" | "base64" | "html" | "url";
  value: string;
}

const iconOptions = ref<IIconOption>();

function handleParse() {
  const { type, value, _value } = props.icon;

  if (_value === "error") {
    forTouchTip("Error", "Plugin icon parse error.", [
      { content: "Sure", type: "error", onClick: async () => true },
    ]);

    return (iconOptions.value = {
      type: "html",
      value: `<svg xmlns="http://www.w3.org/2000/svg" style="color: red" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/></svg>`,
    });
  }

  if (type === "remix") {
    return (iconOptions.value = {
      type: "remix",
      value: value as string,
    });
  }

  if (type === "class") {
    return (iconOptions.value = {
      type: "class",
      value: value as string,
    });
  }

  if (type !== "file") {
    return console.error("PluginIcon not matched --- type not exist.", props);
  }

  if (!_value)
    return console.error("PluginIcon not matched --- _value not exist.", props);

  const extName = _value.split(".").pop();
  if (extName === "svg") {
    const htmlData = transformUint8ArrayToString(new Uint8Array(value as Buffer));

    return (iconOptions.value = {
      type: "html",
      value: htmlData,
    });
  }

  let dataStr = transformArrayBufferToBase64(value as Buffer);

  return `data:image/${extName};base64,${dataStr}`;
}

function transformUint8ArrayToString(fileData: Uint8Array) {
  var dataString = "";
  for (var i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i]);
  }

  return dataString;
}

function transformArrayBufferToBase64(buffer: Buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let len = bytes.byteLength, i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

watchEffect(handleParse);
</script>

<template>
  <span v-if="iconOptions" role="img" class="PluginIcon-Container">
    <remix-icon v-if="iconOptions.type === 'remix'" :name="iconOptions.value" />
    <div v-else-if="iconOptions.type === 'class'" :class="iconOptions.value" />
    <span
      class="html"
      v-else-if="iconOptions.type === 'html'"
      v-html="iconOptions.value"
    />
    <img v-else-if="iconOptions.type === 'base64'" :alt="alt" :src="iconOptions.value" />
    <img v-else-if="iconOptions.type === 'url'" :alt="alt" :src="iconOptions.value" />
  </span>
</template>

<style lang="scss" scoped>
.PluginIcon-Container {
  position: relative;

  width: 100%;
  height: 100%;

  .html {
    display: flex;

    align-items: center;
    justify-content: center;

    color: currentColor;
  }

  img {
    width: 100%;
    height: 100%;

    border-radius: 4px;
  }

  :deep(.remix) {
    width: 1em;
    height: 1em;
  }
}
</style>
