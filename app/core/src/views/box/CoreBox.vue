<script setup lang="ts" name="CoreBox">
import { touchChannel } from "~/modules/channel/channel-core";
import { search, appAmo, execute, BoxMode } from "./search-box";
import BoxItem from "./BoxItem.vue";
import BoxInput from "./BoxInput.vue";
import FileTag from "./tag/FileTag.vue";
import { useDocumentVisibility } from "@vueuse/core";
import { appSetting } from "~/modules/channel/storage/index.ts";
import RemixIcon from "~/components/icon/RemixIcon.vue";
import PrefixIcon from "./PrefixIcon.vue";

const visibility = useDocumentVisibility();
const clipboardOptions = reactive<any>({
  last: null,
});
const searchVal = ref("");
const select = ref(-1);
const res = ref<Array<any>>([]);
const scrollbar = ref();
const boxOptions = reactive<{
  lastHidden: number;
  mode: BoxMode;
  focus: number;
  file: {
    buffer: Uint8Array | null;
    paths: string[];
  };
  data: any;
}>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {},
});

function handleAutoPaste() {
  // handle auto paste
  const time = appSetting.tools.autoPaste.time;
  const timeDiff = Date.now() - clipboardOptions.last.time;

  if (
    time !== -1 &&
    appSetting.tools.autoPaste.enable &&
    (time === 0 || timeDiff < time * 1000)
  ) {
    const data = clipboardOptions.last;

    if (data.type === "file") {
      const pathList = data.data;
      const [firstFile] = pathList;
      if (firstFile) {
        touchChannel
          .send("file:extract-icon", {
            path: firstFile,
          })
          .then((buffer) => {
            boxOptions.file = {
              buffer,
              paths: pathList,
            };
            boxOptions.mode = BoxMode.FILE;
          });
      }
    } else if (data.type !== "image") {
      searchVal.value = data.data;
    }

    clipboardOptions.last = null;
  }
}

watch(
  () => visibility.value,
  (val) => {
    if (!val) return (boxOptions.lastHidden = Date.now());
    else {
      const inputEl = document.getElementById("core-box-input");

      setTimeout(() => inputEl?.focus(), 200);
    }

    // handle auto clear
    if (Date.now() - boxOptions.lastHidden > appSetting.tools.autoClear * 1000) {
      searchVal.value = "";
      boxOptions.mode = BoxMode.INPUT;
      boxOptions.data = {};
    }

    if (clipboardOptions.last) {
      handleAutoPaste();
    }
  }
);

function handleExecute(item: any) {
  const data = execute(item, searchVal.value);
  if (data === "push") {
    boxOptions.mode = BoxMode.FEATURE;

    boxOptions.data = {
      feature: item,
      plugin: item.value,
      query: searchVal.value,
    };
  } else {
    searchVal.value = "";
  }

  select.value = -1;

  // touchChannel.sendSync("core-box:run", searchVal.value);
}

function onKeyDown(event: KeyboardEvent) {
  // check if body contains core-box
  if (!document.body.classList.contains("core-box")) {
    return;
  }

  const lastFocus = boxOptions.focus;

  if (event.key === "Enter") {
    select.value = boxOptions.focus;
    const target = res.value[boxOptions.focus];

    handleExecute(target);
  } else if (event.key === "ArrowDown") {
    boxOptions.focus += 1;

    // Avoid cursor moving in input.
    event.preventDefault();
  } else if (event.key === "ArrowUp") {
    boxOptions.focus -= 1;

    // Avoid cursor moving in input.
    event.preventDefault();
  } else if (event.key === "Escape") {
    handleExit();
  }

  if (boxOptions.focus < 0) {
    boxOptions.focus = 0;
  } else if (boxOptions.focus > res.value.length - 1) {
    boxOptions.focus = res.value.length - 1;
  }

  const diff = Math.max(0, boxOptions.focus * 48);

  const sb = scrollbar.value;

  if (lastFocus < boxOptions.focus) {
    if (diff <= 48 * 9) return;

    sb.scrollTo(0, diff - 48 * 9);
  } else {
    const mod = boxOptions.focus / 9;
    if (!mod) return;

    sb.scrollTo(0, diff - 48 * 9);
  }
}

document.addEventListener("keydown", onKeyDown);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
});

async function handleSearch() {
  boxOptions.focus = 0;
  res.value = [];

  const info: any = {};

  if (boxOptions.mode === BoxMode.FEATURE) {
    Object.assign(info, boxOptions.data);
  }

  await search(searchVal.value, { mode: boxOptions.mode }, info, (v) => {
    const amo = appAmo[v.name] || 0;
    v.amo = amo;

    const arr = [...res.value, v].toSorted((b: any, a: any) =>
      a.type !== b.type ? -a.type.length + b.type.length : a.amo - b.amo
    );

    res.value = arr;
  });
}

watch(
  () => searchVal.value,
  () => {
    handleSearch();
  }
);

watch(
  () => searchVal.value?.length + res.value?.length,
  () => {
    touchChannel.sendSync("core-box:expand", res.value.length);
  }
);

watch(
  () => boxOptions.mode,
  () => {
    handleSearch();
  }
);

watch(
  () => searchVal.value,
  (val) => {
    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND)
      boxOptions.mode = val?.at?.(0) === "/" ? BoxMode.COMMAND : BoxMode.INPUT;
  },
  { immediate: true }
);

touchChannel.regChannel("clipboard:trigger", ({ data }: any) => {
  if (!data?.type) return;

  // console.log("CLIPBOARD TRIGGERED", data);

  Object.assign(clipboardOptions, {
    last: data,
  });
});

function handlePaste() {
  const { clipboard } = touchChannel.sendSync("clipboard:got");

  Object.assign(clipboardOptions, {
    last: clipboard,
  });

  handleAutoPaste();
}

function handleTogglePin() {
  appSetting.tools.autoHide = !appSetting.tools.autoHide;
}

function handleExit() {
  if (boxOptions.mode !== BoxMode.INPUT) {
    boxOptions.mode = searchVal.value.startsWith("/") ? BoxMode.COMMAND : BoxMode.INPUT;
  } else if (searchVal.value) searchVal.value = "";
  else touchChannel.sendSync("core-box:hide");
}

const activeItem = computed(() => res.value[boxOptions.focus]);
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>
  <div @paste="handlePaste" class="CoreBox">
    <div class="CoreBox-Icon">
      <PrefixIcon @close="handleExit" :feature="boxOptions.data?.feature" />
    </div>
    <BoxInput v-model="searchVal" :box-options="boxOptions">
      <template v-if="activeItem" #completion>
        {{ activeItem?.name }}
      </template>
    </BoxInput>

    <div v-if="boxOptions.mode !== BoxMode.FEATURE" class="CoreBox-Tag">
      <template v-if="clipboardOptions.last">
        <span
          v-if="clipboardOptions.last?.type === 'text'"
          class="fake-background dotted"
        >
          Copied Text
        </span>
        <span
          v-else-if="clipboardOptions.last?.type === 'image'"
          class="fake-background dotted"
        >
          Copied Image
        </span>
        <span
          v-else-if="clipboardOptions.last?.type === 'html'"
          class="fake-background dotted"
        >
          Copied Html
        </span>
      </template>
      <!-- <template v-else> -->
      <template v-if="boxOptions.mode === BoxMode.FILE">
        <FileTag :buffer="boxOptions.file.buffer!" :paths="boxOptions.file.paths" />
      </template>
      <template v-else-if="boxOptions.mode === BoxMode.IMAGE"> </template>
      <template v-else-if="boxOptions.mode === BoxMode.COMMAND">
        <span class="fake-background">COMMAND</span>
      </template>
      <!-- <span class="fake-background" v-else>SEARCH</span> -->
      <!-- </template> -->
    </div>
    <div class="CoreBox-Configure">
      <RemixIcon
        :style="appSetting.tools.autoHide ? 'line' : 'fill'"
        @click="handleTogglePin"
        name="pushpin-2"
      />
    </div>
  </div>

  <div class="CoreBoxRes">
    <el-scrollbar ref="scrollbar">
      <BoxItem
        @click="handleExecute(item)"
        :i="index + 1"
        @mousemove="boxOptions.focus = index"
        :active="boxOptions.focus === index"
        v-for="(item, index) in res"
        :key="index"
        :data="item"
        :selected="select === index"
      />
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
.CoreBox-Tag {
  position: relative;
  display: flex;

  min-width: 64px;
  width: max-content;
  max-width: 360px;
  height: 60px;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  // right: 20px;
  top: 0;

  justify-content: flex-end;
  align-items: center;

  user-select: none;

  span {
    padding: 2px 4px;
    font-size: 15px;

    --fake-inner-opacity: 0.5 !important;
    --fake-color: var(--el-color-primary);
    border-radius: 8px;
    // background-color: var(--el-color-warning-light-5);
  }
}

.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;

  cursor: pointer;
  font-size: 1.25em;
}

.CoreBox-Icon {
  position: relative;

  user-select: none;

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
  z-index: 100000000;
  position: absolute;
  padding: 4px 8px;
  display: none;

  width: 100%;
  height: 64px;

  left: 0;
  top: 0;

  gap: 0.25rem;
  align-items: center;

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

.core-box .CoreBox-Mask {
  z-index: -100;
  position: absolute;

  inset: 0;

  opacity: 0.125;
  background-color: var(--el-bg-color);
}
</style>
