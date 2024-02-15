<script setup lang="ts" name="CoreBox">
import { touchChannel } from "~/modules/channel/channel-core";
import BoxItem from "./BoxItem.vue";

const searchVal = ref("");

const res = ref<Array<any>>([]);

touchChannel.regChannel("core-box:res", ({ data }: any) => {
  const { keyword, res: _res } = data!;
  if (keyword !== searchVal.value) return;

  res.value.push(..._res);

  console.log(res.value);
});

watch(
  () => searchVal.value,
  (val) => {
    res.value = [];

    touchChannel.sendSync("core-box:search", { keyword: val });
  }
);

watch(
  () => res.value.length,
  (val) => {
    touchChannel.sendSync("core-box:expand", val > 0);
  }
);
</script>

<template>
  <div class="CoreBox">
    <input
      id="core-box-input"
      placeholder="Type what you want to search by talex-touch."
      v-model="searchVal"
    />
  </div>

  <div class="CoreBoxRes">
    <el-scrollbar>
      <BoxItem v-for="(item, index) in res" :key="index" :data="item" />
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
div.CoreBoxRes {
  position: absolute;
  display: none;

  flex-direction: column;

  top: 60px;

  width: 100%;
  height: calc(100% - 60px);

  border-radius: 0 0 8px 8px;
  .core-box & {
    display: flex;
  }
}

div.CoreBox {
  input {
    width: 100%;
    height: 52px !important;

    outline: none;
    border: none;

    font-size: 16px;

    border-radius: 8px;
    background-color: transparent;

    opacity: 0.75;

    font-size: 22px;
    // box-shadow: 0 0 2px 1px var(--el-color-primary-light-3),
    //   0 0 4px 2px var(--el-color-primary-light-5);
  }

  z-index: 100000000;
  position: absolute;
  padding: 4px 8px;
  display: none;

  justify-content: center;

  width: 100%;
  height: 60px;

  left: 0;
  top: 0;

  border-radius: 8px;
  box-sizing: border-box;
  // backdrop-filter: saturate(180%) brightness(0.9) blur(5px);

  .core-box & {
    display: flex;
  }
}

.core-box .AppLayout-Wrapper {
  visibility: hidden;
  // filter: saturate(180%) brightness(0.9) blur(5px);
  // transform: scale(1.0125);

  // user-select: none;
  // pointer-events: none;
  // -webkit-app-region: drag;
}
</style>
