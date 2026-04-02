<script lang="ts" setup>
import { $endApi } from '~/composables/api/base'
import type { IStandardPageModel } from '~/composables/api/base/index.type'
import { globalOptions } from '~/constants'

// const done = ref(false)
// const loader = ref<HTMLElement>()
const items = reactive<any>({
  loading: false,
  list: [],
  hotList: [],
  tagList: [],
  tagSelected: 0,
  meta: {
    currentPage: -1,
    totalItems: 0,
    itemCount: 0,
    itemsPerPage: 0,
    totalPages: 0,
  },
})

const query = ref('')
const list = computed(() => (query.value || items.tagSelected !== 0) ? items.list : items.hotList)

async function _fetchData() {
  items.loading = true
  items.list.length = 0

  await sleep(500)

  const select = items.tagList[items.tagSelected]
  const selectQuery = `${items.tagSelected !== 0 ? select.name : ''}`.replaceAll(query.value, '')

  const res = await $endApi.v1.aigc.searchPromptTemplate(`${selectQuery}${query.value}`)

  if (res.data.length > 0)
    items.list = [...res.data]

  items.loading = false
}

const fetchData = useDebounceFn(_fetchData)

watchEffect(() => {
  const _ignored = [query.value, items.tagSelected]

  fetchData()
})

onMounted(async () => {
  const tagRes = await $endApi.v1.aigc.recommendTags()

  if (tagRes.code === 200) {
    items.tagList = [{ name: '全部', id: 0 }, ...tagRes.data.items]
  }
  else {
    ElMessage({
      message: '无法搜索模板！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }

  const hotListRes = await $endApi.v1.aigc.getHostList()

  if (hotListRes.code === 200) {
    items.hotList = hotListRes.data
  }
  else {
    ElMessage({
      message: '无法搜索模板！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }
})
</script>

<template>
  <div class="PromptRole">
    <div class="PromptRole-Header fake-background">
      <div class="PromptRole-Header-Title">
        角色列表
      </div>
    </div>

    <div class="PromptRole-MainVice">
      <el-input v-model.lazy="query" placeholder="搜索角色名称或描述...">
        <template #prefix>
          <div i-carbon:search />
        </template>
      </el-input>
      <div class="PromptRole-MainVice-Tags">
        <span
          v-for="(tag, i) in items.tagList" :key="tag.id" :class="{ active: i === items.tagSelected }"
          class="tag-item" @click="items.tagSelected = i"
        >
          {{ tag.name }}
        </span>
      </div>
    </div>

    <div class="PromptRole-Main">
      <el-scrollbar v-if="!items.loading">
        <div v-if="list.length" class="PromptRole-MainInner">
          <div
            v-for="(item, ind) in list" :key="item.id" :style="`--d: ${Number(ind) * 0.025 + 0.125}s`" h-full w-full
            class="PromptRole-CardContainer"
          >
            <CardPromptRoleCard animation :model-value="item" />
          </div>
        </div>
        <div v-else>
          <el-empty description="暂时没有搜索到任何内容." />
        </div>

        <br v-for="i in 4" :key="i">
      </el-scrollbar>
      <div flex justify-center class="PromptRole-Loader">
        <LoadersEagleRoundLoading />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.PromptRole-CardContainer {
  opacity: 0;

  animation: promptRoleCardEnter 0.25s var(--d) forwards;
}

@keyframes promptRoleCardEnter {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }

  60% {
    opacity: 1;
    transform: translateY(-3px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.PromptRole-MainInner {
  padding: 1rem;
  display: grid;

  gap: 1rem;

  justify-items: center;
  align-content: center;
  place-content: center;
}

@media (min-width: 640px) {
  .PromptRole-MainInner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 780px) {
  .PromptRole-MainInner {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.PromptRole-MainVice-Tags {
  span {
    &.active::before {
      transform: scaleX(1);
    }

    &::before {
      content: '';
      position: absolute;

      width: 100%;
      height: 2px;

      left: 0;
      bottom: 0;

      border-radius: 4px;
      transform: scaleX(0);
      background-color: var(--theme-color);
      transition: 0.25s cubic-bezier(0.215, 0.61, 0.355, 1);
    }

    position: relative;
    padding: 0.25rem 0.5rem;

    cursor: pointer;
    color: var(--el-text-color-regular);
  }

  display: flex;

  gap: 0.25rem;

  justify-content: center;
}

.PromptRole-MainVice {
  .el-input {
    width: 320px;
  }

  display: flex;
  margin: 1rem auto;

  width: 600px;
  max-width: 85%;

  gap: 0.5rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;
}

.PromptRole {
  &-Main {
    @media (min-width: 1400px) {
      & {
        max-width: 1400px;
      }
    }

    position: relative;
    margin: 0 auto;
    padding: 1rem;

    height: calc(100% - 64px);
  }

  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  --color: rgba(114, 114, 114, 0.05);
  background-color: var(--el-bg-color);
  background-image: linear-gradient(
      0deg,
      transparent 24%,
      var(--color) 25%,
      var(--color) 26%,
      transparent 27%,
      transparent 74%,
      var(--color) 75%,
      var(--color) 76%,
      transparent 77%,
      transparent
    ),
    linear-gradient(
      90deg,
      transparent 24%,
      var(--color) 25%,
      var(--color) 26%,
      transparent 27%,
      transparent 74%,
      var(--color) 75%,
      var(--color) 76%,
      transparent 77%,
      transparent
    );
  background-size: 55px 55px;

  .PromptRole-Header {
    position: sticky;
    padding: 0 16px;

    top: calc(0 - var(--el-main-padding));

    height: 64px;

    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(18px) saturate(180%);

    .PromptRole-Header-Title {
      font-size: 20px;
      font-weight: 600;
    }
  }
}
</style>
