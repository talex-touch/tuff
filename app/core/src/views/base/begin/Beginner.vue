<script setup lang="ts" name="Beginner">
import { sleep } from "@talex-touch/utils/common";
import Greeting from "./internal/Greeting.vue";
import { appSetting, storageManager } from "~/modules/channel/storage/index.ts";

const main = ref();
const content = ref();
const component = ref();
const last_component = ref();

if (!appSetting.beginner) {
  appSetting.beginner = {
    init: false,
  };
}

async function step(call: any, dataAction?: Function) {
  content.value.style.opacity = "0";

  await sleep(300);

  const { comp, rect } = call;

  dataAction?.(storageManager);

  if (!comp) {
    main.value.parentElement.style.opacity = "0";
    main.value.parentElement.style.transform = "scale(1.05)";

    await sleep(1000);

    main.value.parentElement.style.display = "none";

    return;
  }

  if (rect) {
    Object.assign(main.value.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    await sleep(300);
  }

  last_component.value = component.value;
  component.value = comp;

  await sleep(100);

  content.value.style.opacity = "1";
}

provide("step", step);
provide("back", () => {
  step({
    comp: last_component.value,
  });
});

onMounted(() => {
  step({
    comp: Greeting,
  });
});
</script>

<template>
  <div class="Beginner">
    <div ref="main" class="Beginner-Main fake-background transition-cubic">
      <div ref="content" class="Beginner-Content transition-cubic">
        <component :is="component" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Beginner {
  &-Content {
    position: absolute;
    padding: 2rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    box-sizing: border-box;
  }

  &-Main {
    position: absolute;
    padding: 2rem;

    width: 60%;
    height: 80%;

    left: 50%;
    top: 50%;

    animation: join 1s;

    --fake-inner-opacity: 0.98;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    backdrop-filter: saturate(180%) brightness(99%) blur(50px);
  }

  z-index: 1000;
  position: absolute;

  width: 100%;
  height: 100%;

  left: 0;
  top: 0;

  .dark & {
    background-color: #00000080;
  }

  background-color: #ffffff80;
}

@keyframes join {
  from {
    transform: translate(-50%, -50%) scale(1.05);
  }

  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
