<template>
  <span role="img" class="PluginIcon-Container">
    <remix-icon v-if="icon.type === 'remix'" :name="icon?.value" />
    <img v-else :alt="alt" :src="iconConverter()" />
  </span>
</template>

<script>
import RemixIcon from '@comp/icon/RemixIcon.vue'

export default {
  name: "PluginIcon",
  components: { RemixIcon },
  props: {
    icon: {
      type: Object
    },
    alt: {
      type: String
    }
  },
  setup(props) {

    function iconConverter() {
      // const binary = Buffer.from(props.icon.value)
      // const imgData = new Blob(binary, { type: 'application/octet-binary' })
      // const link = URL.createObjectURL(new Blob(new ArrayBuffer(props.icon.value)))

      function transformArrayBufferToBase64 (buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let len = bytes.byteLength, i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      }
      let dataStr = transformArrayBufferToBase64(props.icon.value)
      return "data:image/png;base64," + dataStr
    }

    return {
      iconConverter
    }

  }
}
</script>

<style lang="scss" scoped>
.PluginIcon-Container {
  position: relative;

  width: 100%;
  height: 100%;
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