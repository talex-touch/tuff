<script setup lang="ts" name="Protocol">
import Protocol from "~/assets/docs/protocol.md?raw";
import AgreementTemplate from "~/components/addon/AgreementTemplate.vue";
import Forbidden from "./Forbidden.vue";
import License from "./License.vue";

const step = inject("step")!;

function handleAgree(val: boolean) {
  step({
    comp: val ? License : Forbidden,
  });
}
</script>

<template>
  <div class="Protocol">
    <AgreementTemplate :agree="handleAgree" :agreement="Protocol" />
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
