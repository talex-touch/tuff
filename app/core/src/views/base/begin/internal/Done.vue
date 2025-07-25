<script setup lang="ts" name="Done">
import HelloData from "~/assets/lotties/welcome.json";
import LottieFrame from "~/components/icon/lotties/LottieFrame.vue";
import { appSetting } from '~/modules/channel/storage';

const step: any = inject("step")!;

function goon() {
  step(
    {
      comp: null,
    },
    () => {
      appSetting.beginner.init = true;
    }
  );
}
</script>

<template>
  <div class="Greeting">
    <LottieFrame :loop="true" :data="HelloData" />

    <div class="Greeting-Content">
      <p>Flick the button to continue.</p>
      <FlatButton @click="goon" primary> DONE </FlatButton>
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

.Greeting {
  position: relative;
  height: 100%;

  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    opacity: 0;
    animation: join forwards 0.5s 3s;
  }
}
</style>
