<script setup lang="ts" name="CoreBox">
import { touchChannel } from "~/modules/channel/channel-core";
import AppIcon from "~/assets/logo.svg";
import { search, appAmo, execute } from "./search-box";
import BoxItem from "./BoxItem.vue";

const searchVal = ref("");
const focus = ref(0);
const res = ref<Array<any>>([]);
const scrollbar = ref();

function onKeyDown(event: KeyboardEvent) {
  // check if body contains core-box
  if (!document.body.classList.contains("core-box")) {
    return;
  }

  const lastFocus = focus.value;

  if (event.key === "Enter") {
    execute(res.value[focus.value]);

    searchVal.value = "";
    // touchChannel.sendSync("core-box:run", searchVal.value);
  } else if (event.key === "ArrowDown") {
    focus.value = focus.value + 1;
  } else if (event.key === "ArrowUp") {
    focus.value = focus.value - 1;
  } else if (event.key === "Escape") {
    searchVal.value = "";
  }

  if (focus.value < 0) {
    focus.value = 0;
  } else if (focus.value > res.value.length - 1) {
    focus.value = res.value.length - 1;
  }

  const diff = Math.max(0, focus.value * 48);

  const sb = scrollbar.value;

  if (lastFocus < focus.value) {
    if (diff <= 48 * 9) return;

    sb.scrollTo(0, diff - 48 * 9);
  } else {
    const mod = focus.value / 9;
    if (!mod) return;

    sb.scrollTo(0, diff - 48 * 9);
  }
}

document.addEventListener("keydown", onKeyDown);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
});

watch(
  () => searchVal.value,
  (val) => {
    focus.value = 0;
    res.value = [];

    search(val, (v: any) => {
      const amo = appAmo[v.name] || 0;
      v.amo = amo;

      const arr = [...res.value, v].toSorted((b: any, a: any) => a.amo - b.amo);

      res.value = arr;
    });

    // touchChannel.sendSync("core-box:search", { keyword: val });
  }
);

watch(
  () => searchVal.value?.length + res.value?.length,
  () => {
    touchChannel.sendSync("core-box:expand", res.value.length);
  }
);

const commandMode = computed(() => searchVal.value?.at?.(0) === "/");
</script>

<template>
  <div class="CoreBox">
    <div class="CoreBox-Icon">
      <img :src="AppIcon" />
    </div>
    <input
      id="core-box-input"
      placeholder="Type what you want to search by talex-touch."
      v-model="searchVal"
    />

    <div class="CoreBox-Tag">
      <span class="fake-background" v-if="commandMode">COMMAND</span>
      <span class="fake-background" v-else>SEARCH</span>
    </div>
  </div>

  <div class="CoreBoxRes">
    <el-scrollbar ref="scrollbar">
      <BoxItem
        @click="execute(item)"
        :i="index + 1"
        @mousemove="focus = index"
        :active="focus === index"
        v-for="(item, index) in res"
        :key="index"
        :data="item"
      />
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
.CoreBox-Tag {
  position: absolute;
  display: flex;

  width: 64px;
  height: 60px;

  right: 20px;
  top: 0;

  justify-content: flex-end;
  align-items: center;

  span {
    padding: 2px 4px;
    font-size: 15px;

    --fake-inner-opacity: 0.5 !important;
    --fake-color: var(--el-color-primary);
    border-radius: 8px;
    // background-color: var(--el-color-warning-light-5);
  }
}

.CoreBox-Icon {
  position: relative;

  img {
    width: 52px;
    height: 52px;
  }
}

div.CoreBoxRes {
  position: absolute;
  display: none;

  flex-direction: column;

  top: 60px;

  width: 100%;
  height: calc(100% - 60px);

  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--el-border-color);

  .core-box & {
    display: flex;
  }
}

div.CoreBox {
  input {
    margin-left: 8px;

    width: calc(100% - 158px);
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
