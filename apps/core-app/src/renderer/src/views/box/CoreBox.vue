<script setup lang="ts" name="CoreBox">
import { touchChannel } from "~/modules/channel/channel-core";
import { search, appAmo, execute, BoxMode } from "./search-box";
import { insertSorted } from "./search-sorter";
import BoxItem from "./BoxItem.vue";
import BoxInput from "./BoxInput.vue";
import FileTag from "./tag/FileTag.vue";
import { useDocumentVisibility, useDebounceFn } from "@vueuse/core";
import { appSetting } from "~/modules/channel/storage/index.ts";
import RemixIcon from "~/components/icon/RemixIcon.vue";
import PrefixIcon from "./PrefixIcon.vue";
import TouchScroll from "~/components/base/TouchScroll.vue";

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

/**
 * Handles automatic paste functionality based on clipboard data and timing settings
 */
function handleAutoPaste() {
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

/**
 * Executes the selected item and handles query clearing logic
 * @param item - The selected search item to execute
 */
function handleExecute(item: any) {
  const data = execute(item, searchVal.value);
  if (data === "push") {
    boxOptions.mode = BoxMode.FEATURE;

    /**
     * Determine whether to clear the search query:
     * - If matched by name/description/keywords (matchedByName === true), clear the query
     * - If matched by command conditions (no matchedByName flag), preserve the query
     */
    const shouldClearQuery = item.matchedByName === true;
    const queryToUse = shouldClearQuery ? "" : searchVal.value;

    // Use originFeature if available (for command items), otherwise use the item itself
    const featureToUse = item.originFeature || item;

    boxOptions.data = {
      feature: featureToUse,
      plugin: item.value,
      query: queryToUse,
      pushedItemIds: new Set(), // 记录当前 feature 推送的数据 ID
    };

    console.log("[CoreBox] Entering FEATURE mode with data:", boxOptions.data);

    if (shouldClearQuery) {
      searchVal.value = "";
    }
  } else {
    searchVal.value = "";
  }

  select.value = -1;
}

/**
 * Handles keyboard navigation and actions for the search box
 * @param event - The keyboard event
 */
function onKeyDown(event: KeyboardEvent) {
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
    event.preventDefault();
  } else if (event.key === "ArrowUp") {
    boxOptions.focus -= 1;
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

/**
 * Performs search operation and updates results
 */
async function handleSearch() {
  console.debug(`[CoreBox] handleSearch() called - searchVal: "${searchVal.value}", mode: ${boxOptions.mode}`);
  console.debug(`[CoreBox] Before search - res.value.length: ${res.value.length}`);

  boxOptions.focus = 0;

  // 清空之前的搜索结果，但在 FEATURE 模式下保留当前 feature 推送的数据
  const beforeFilter = res.value.length;
  if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
    // 在 FEATURE 模式下，只保留当前 feature 推送的数据
    const pushedIds = boxOptions.data.pushedItemIds;
    res.value = res.value.filter((item: any) => item.pushedItemId && pushedIds.has(item.pushedItemId));
    console.log(`[CoreBox] FEATURE mode - preserved ${res.value.length} items pushed by current feature`);
  } else {
    // 在其他模式下，清空所有结果
    res.value = [];
    console.log(`[CoreBox] Non-FEATURE mode - cleared all results`);
  }
  console.log(`[CoreBox] Filtered results - before: ${beforeFilter}, after: ${res.value.length}`);

  if (!searchVal.value) {
    console.log(`[CoreBox] Empty search value - clearing data and returning`);
    boxOptions.data = {};
    return;
  }

  const info: any = {};

  if (boxOptions.mode === BoxMode.FEATURE) {
    Object.assign(info, boxOptions.data);
    console.log(`[CoreBox] FEATURE mode - info:`, info);
  }

  console.log(`[CoreBox] Starting search with callback...`);
  let callbackCount = 0;

  await search(searchVal.value, { mode: boxOptions.mode }, info, (v) => {
    callbackCount++;
    console.log(`[CoreBox] Search callback ${callbackCount} - item: "${v.name}" (type: ${v.type}, pluginType: ${v.pluginType})`);

    const amo = appAmo[v.name] || 0;
    v.amo = amo;

    const beforeInsert = res.value.length;
    res.value = insertSorted(res.value, v, searchVal.value);
    console.log(`[CoreBox] Inserted item - res.value.length: ${beforeInsert} -> ${res.value.length}`);
  });

  console.log(`[CoreBox] Search completed - total callbacks: ${callbackCount}, final res.value.length: ${res.value.length}`);
}

watch(
  () => searchVal.value,
  () => {
    handleSearch();
  }
);

const debouncedExpand = useDebounceFn(() => {
  touchChannel.sendSync("core-box:expand", res.value.length);
}, 50);

watch(
  () => searchVal.value?.length + res.value?.length,
  () => {
    debouncedExpand();
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

/**
 * Handles CoreBox show/hide events and refreshes search data when shown
 */
touchChannel.regChannel("core-box:trigger", ({ data }: any) => {
  const { show, id } = data;

  console.log(`[CoreBox] core-box:trigger received - show: ${show}, id: ${id}`);
  console.log(`[CoreBox] window.$startupInfo:`, window.$startupInfo);

  // Check if this trigger is for our window
  const isOurWindow = window.$startupInfo?.id === undefined || window.$startupInfo.id === id;

  if (show && isOurWindow) {
    console.log(`[CoreBox] CoreBox is being shown - refreshing search data`);

    // Import and call refreshSearchList when CoreBox is shown (with cooldown protection)
    import("./search-box").then(({ refreshSearchList }) => {
      refreshSearchList().then(() => {
        console.log(`[CoreBox] Search data refreshed successfully`);
      }).catch(error => {
        console.error(`[CoreBox] Failed to refresh search data:`, error);
      });
    }).catch(error => {
      console.error(`[CoreBox] Failed to import search-box module:`, error);
    });
  } else {
    console.log(`[CoreBox] Skipping refresh - show: ${show}, isOurWindow: ${isOurWindow}`);
  }
});

/**
 * Handles plugin search results pushed directly from plugins
 */
touchChannel.regChannel("core-box:push-items", ({ data }: any) => {
  console.log("[CoreBox] Received plugin search results:", data);

  if (data && data.items && Array.isArray(data.items)) {
    console.log(`[CoreBox] Before adding: res.value.length = ${res.value.length}`);

    data.items.forEach((item: any) => {
      const amo = appAmo[item.name] || 0;
      item.amo = amo;

      // 为每个推送的项目生成唯一 ID
      const itemId = `${item.name}-${item.desc || ''}-${item.value || ''}-${Date.now()}-${Math.random()}`;
      item.pushedItemId = itemId;

      // 如果当前是 FEATURE 模式，记录推送的数据 ID
      if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
        boxOptions.data.pushedItemIds.add(itemId);
        console.log(`[CoreBox] Recorded pushed item ID: ${itemId} for current feature`);
      }

      console.log("[CoreBox] Adding item:", item);
      res.value = insertSorted(res.value, item, searchVal.value);
    });

    console.log(`[CoreBox] After adding: res.value.length = ${res.value.length}`);
    console.log(`[CoreBox] Added ${data.items.length} plugin search results to display`);
  }
});

/**
 * Handles plugin search results clearing from plugins
 */
touchChannel.regChannel("core-box:clear-items", ({ data }: any) => {
  console.log("[CoreBox] Plugin cleared search results:", data);

  if (data && data.pluginName) {
    // 清除指定插件的数据，同时从 pushedItemIds 中移除
    const beforeCount = res.value.length;
    const removedIds = new Set();

    res.value = res.value.filter((item: any) => {
      if (item.value === data.pluginName) {
        // 记录被移除的 ID
        if (item.pushedItemId) {
          removedIds.add(item.pushedItemId);
        }
        return false; // 移除这个项目
      }
      return true; // 保留这个项目
    });

    // 从当前 feature 的 pushedItemIds 中移除已清除的 ID
    if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
      removedIds.forEach(id => {
        boxOptions.data.pushedItemIds.delete(id);
      });
    }

    const afterCount = res.value.length;
    console.log(`[CoreBox] Cleared ${beforeCount - afterCount} search results from plugin: ${data.pluginName}`);
  }
});

/**
 * Handles paste operation from clipboard
 */
function handlePaste() {
  const { clipboard } = touchChannel.sendSync("clipboard:got");

  Object.assign(clipboardOptions, {
    last: clipboard,
  });

  handleAutoPaste();
}

/**
 * Toggles the auto-hide pin state
 */
function handleTogglePin() {
  appSetting.tools.autoHide = !appSetting.tools.autoHide;
}

/**
 * Handles exit/escape actions for the search box
 */
function handleExit() {
  if (boxOptions.mode !== BoxMode.INPUT) {
    // When exiting from FEATURE mode, clear only the plugin results pushed by current feature
    if (boxOptions.mode === BoxMode.FEATURE) {
      console.log("[CoreBox] Exiting FEATURE mode - clearing current feature's plugin results");

      // 只清除当前 feature 推送的数据
      if (boxOptions.data?.pushedItemIds && boxOptions.data.pushedItemIds.size > 0) {
        const pushedIds = boxOptions.data.pushedItemIds;
        const beforeCount = res.value.length;

        res.value = res.value.filter((item: any) => {
          // 保留不是当前 feature 推送的数据
          return !item.pushedItemId || !pushedIds.has(item.pushedItemId);
        });

        const afterCount = res.value.length;
        console.log(`[CoreBox] Cleared ${beforeCount - afterCount} items pushed by current feature`);
      }

      // Notify plugins that we're exiting feature mode
      if (boxOptions.data?.plugin) {
        touchChannel.send("trigger-plugin-feature-exit", {
          plugin: boxOptions.data.plugin
        });
      }
    }

    boxOptions.mode = searchVal.value.startsWith("/") ? BoxMode.COMMAND : BoxMode.INPUT;
    boxOptions.data = {}
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
      <template v-if="searchVal.trim() && activeItem && boxOptions.mode !== BoxMode.FEATURE" #completion>
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
    <TouchScroll ref="scrollbar">
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
    </TouchScroll>
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

  opacity: 0.25;
  background-color: var(--el-bg-color);
}
</style>
