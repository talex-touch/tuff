<script name="BrickTemplate" setup lang="ts">
import FlatButton from '@comp/base/button/FlatButton.vue'

</script>

<template>
  <div mr-6 border-solid border rounded-lg relative inline-block px-4 w-60 h-32 class="color-template fake-background">
    <slot>
      <p>
        <div inline-block mr-2 class="i-simple-icons-remix" />Template
      </p>
      <span text-sm>
        This is a template brick template.
      </span>
      <button cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded px-2
        py-1 my-2>Open in window</button>
    </slot>
  </div>
</template>

<style lang="scss" scoped></style>