<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <div>
    <HelloWorld msg="Hello VVTE Template" />
    <div class="ColorMixin">
      <p>Color1</p>
      <p>Color2</p>
      <p>Color3</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$color: #ff0000;

.ColorMixin {
  p {
    margin: 0;
    color: $color;
  }

  p+p {
    color: transparentize($color, $amount: 0.25);
  }

  p+p+p {
    color: transparentize($color, $amount: 0.5);
  }
}
</style>
