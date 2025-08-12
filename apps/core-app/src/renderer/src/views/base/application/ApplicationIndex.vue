<script name="ApplicationIndex" setup lang="ts">
import AppList from "./AppList.vue";
import AppConfigure from "./AppConfigure.vue";
import ApplicationEmpty from "./ApplicationEmpty.vue";
import { refreshSearchList, apps, search, appAmo, execute } from "~/views/box/search-box";

defineProps<{
  modelValue?: boolean;
}>();

const index = ref(-1);
const curSelect = ref();
const appList: any = ref(apps.value);

onMounted(() => {
  setTimeout(async () => {
    await refreshSearchList();
  }, 200);
});

async function handleSearch(value: string) {
  if (!value.length) {
    appList.value = apps.value;
    return;
  }
  appList.value = [];

  await search(value, { mode: 0 }, {}, (v: any) => {
    const amo = appAmo[v.name] || 0;
    v.amo = amo;

    const arr = [...appList.value, v].toSorted((b: any, a: any) => a.amo - b.amo);

    appList.value = arr;
  });
}

function handleSelect(item: any, _index: number) {
  curSelect.value = item;
  index.value = _index;
}

function handleExecute(item: any) {
  execute(item);
}
</script>

<template>
  <div class="ApplicationIndex">
    <div class="ApplicationList">
      <AppList
        :index="index"
        @select="handleSelect"
        @search="handleSearch"
        :list="appList"
      />
    </div>
    <div class="ApplicationContent">
      <ApplicationEmpty v-if="!curSelect" />
      <AppConfigure v-else @execute="handleExecute" :data="curSelect" />
    </div>
  </div>
</template>

<style lang="scss">
.ApplicationIndex {
  position: relative;
  display: flex;
  height: 100%;

  .ApplicationList {
    min-width: 200px;
    width: 30%;
    height: 100%;
    border-right: 1px solid var(--el-border-color);

    flex-shrink: 0;
  }

  .ApplicationContent {
    flex: 1;
  }
}
</style>
