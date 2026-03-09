<script setup lang="ts">
import GuideAside from '~/components/guide/GuideAside.vue'
import { $endApi } from '~/composables/api/base'
import DocLayout from '~/components/chore/doc/DocLayout.vue'

const route = useRoute()
const router = useRouter()
const key = computed(() => route.query.key as string)

const protocol = ref<any>()
const content = computed(() => {
  const text = protocol.value?.detail?.[1]?.content

  if (!text)
    return ''

  return decodeURIComponent(atob(text))
})
const outline = ref('')

async function fetchData() {
  const res = await $endApi.v1.cms.doc.agreementInfo(key.value)

  if (res.data) {
    outline.value = ''
    protocol.value = res.data
  }
  else {
    ElMessage.error('获取协议失败！')

    await sleep(1200)

    router.push('/')
  }
}

watchEffect(() => {
  if (!key.value)
    return

  fetchData()
})

function handleOutLine(data: any) {
  outline.value = data
}

let _func: any
provide('onScroll', (func: any) => {
  _func = func
})

function handleScroll(e: any) {
  _func?.(e)
}
</script>

<template>
  <DocLayout>
    <div class="Guide expand">
      <el-main>
        <div v-if="content" class="GuideMain markdown-body">
          <el-scrollbar @scroll="handleScroll">
            <div class="GuideMain-Header">
              <h1>{{ protocol.doc.title }}</h1>
              <p>最后更新于 {{ formatDate(protocol.updatedAt) }}</p>
            </div>
            <ArticleMilkContent :content="content" @outline="handleOutLine" />
          </el-scrollbar>
        </div>
        <div v-else class="GuideSkeleton">
          <el-skeleton :rows="2" animated />
          <el-skeleton :rows="20" animated />
        </div>
        <ClientOnly>
          <ArticleContentOutline v-if="outline" :outline="outline" />
        </ClientOnly>
      </el-main>
    </div>
  </DocLayout>
</template>

<style lang="scss" scoped>
.GuideSkeleton {
  display: flex;
  padding: 2rem;

  gap: 2rem;
  flex-direction: column;
}

.GuideMain {
  &-Header {
    h1 {
      font-size: 24px;
      font-weight: 600;
    }

    p {
      opacity: 0.5;
    }

    padding: 1rem 2rem;
  }

  .el-scrollbar {
    width: 100%;
  }

  position: relative;

  flex: 1;
  width: 100%;
  height: 100%;
}

.el-main > div {
  .RenderContent {
    padding: 0 10%;
  }

  display: flex;

  width: 100%;
  // max-width: 1480px;

  // margin: 0 auto;
}

.el-main {
  :deep(> ul) {
    // flex-shrink: 0;
    min-width: 220px;
    // width: 30%;
    max-width: 280px;

    flex: 1;
    border-left: 1px solid var(--el-border-color);
  }

  position: relative;
  display: flex;
  padding: 0;

  // flex-shrink: 0;
  // width: 100%;

  overflow: hidden;
}

// .outline-preview {
//   width: 30%;

//   border-left: 1px solid var(--el-border-color);
// }

.Guide {
  position: absolute;
  display: flex;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
}
</style>
