<script setup lang="ts">
import HelloData from "~/assets/lotties/compress-loading.json";
import LottieFrame from "~/components/icon/lotties/LottieFrame.vue";

const back = inject("back")!;

function goon() {
  back();
}

function close() {
  window.$nodeApi.close();
}
</script>

<template>
  <div class="Forbidden">
    <LottieFrame :loop="true" :data="HelloData" />

    <div class="Forbidden-Content">
      <p>We can't provide you with services.</p>
      <div flex gap-8>
        <FlatButton @click="close"> CLOSE </FlatButton>
        <FlatButton @click="back" primary> BACK </FlatButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.LottieFrame-Container {
  position: relative;
  height: 80%;
}

@keyframes join {
  to {
    opacity: 1;
  }
}

.Forbidden {
  position: relative;
  height: 100%;

  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    opacity: 0;
    animation: join forwards 0.5s 1s;
  }
}
</style>
