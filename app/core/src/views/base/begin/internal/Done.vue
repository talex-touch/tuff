<script setup lang="ts" name="Done">
import HelloData from "~/assets/lotties/welcome.json";
import LottieFrame from "~/components/icon/lotties/LottieFrame.vue";
import Protocol from "./Protocol.vue";

const step = inject("step")!;

function goon() {
  step(
    {
      comp: null,
    },
    (sm) => {
      sm.appSetting.beginner.init = true;
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
  &-Content {
    display: flex;

    align-items: center;
    flex-direction: column;

    opacity: 0;
    animation: join forwards 0.5s 3s;
  }
  position: relative;

  height: 100%;
}
</style>
