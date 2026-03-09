<script setup lang="ts">
import GuideAside from '~/components/guide/GuideAside.vue'
import { $endApi } from '~/composables/api/base'
import DocLayout from '~/components/chore/doc/DocLayout.vue'

const route = useRoute()
const curDoc = ref()
const documents = ref([])

function handleSelect(data: any) {
  curDoc.value = data
}

const content = ref('')
const outline = ref('')

watchEffect(() => {
  if (!curDoc.value)
    return

  const _content = curDoc.value.record?.content || ''

  outline.value = ''
  content.value = _content ? decodeURIComponent(atob(_content)) : ''
})

onMounted(async () => {
  const res: any = await $endApi.v1.cms.doc.deployedList({})

  if (res.code === 200) { documents.value = res.data.items }
  else { ElMessage.error(res.message); return }

  const query = route.query.data
  if (query)
    curDoc.value = documents.value.find((item: any) => item.title === query)
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
      <div class="GuideAside">
        <ClientOnly>
          <GuideAside :data="documents" @select="handleSelect" />
        </ClientOnly>
      </div>
      <el-main>
        <div v-if="curDoc" class="GuideMain markdown-body">
          <el-scrollbar @scroll="handleScroll">
            <div class="GuideMain-Header">
              <h1>{{ curDoc.title }}</h1>
              <p>最后更新于 {{ formatDate(curDoc.updatedAt) }}</p>
            </div>
            <ArticleMilkContent :content="content" @outline="handleOutLine" />
          </el-scrollbar>
        </div>
        <ClientOnly>
          <ArticleContentOutline v-if="outline" :outline="outline" />
        </ClientOnly>
      </el-main>
    </div>
  </DocLayout>
</template>

<style lang="scss" scoped>
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

.GuideAside {
  position: relative;

  min-width: 240px;
  height: 100%;

  top: 0;
  left: 0;

  flex-shrink: 0;
}
</style>
