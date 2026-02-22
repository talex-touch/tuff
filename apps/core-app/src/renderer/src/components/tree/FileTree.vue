<script name="FileTree" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { TxTree } from '@talex-touch/tuffex'
import { computed, onMounted, reactive, ref } from 'vue'
import IconButton from '~/components/base/button/IconButton.vue'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { devLog } from '~/utils/dev-log'

const props = defineProps({
  fileAdpoter: {
    type: Object,
    required: true
  },
  modelValue: {
    type: Array,
    required: true
  }
})
const emit = defineEmits(['update:modelValue'])

const options = reactive({
  select: null
})
const files = useModelWrapper(props, emit)
const treeNodes = ref([])
const expandedKeys = ref([])
const loadingKeys = ref(new Set())

const nodeMap = computed(() => {
  const map = new Map()
  const walk = (list) => {
    list.forEach((node) => {
      map.set(node.key, node)
      if (node.children?.length) walk(node.children)
    })
  }
  walk(treeNodes.value)
  return map
})

onMounted(() => {
  refresh()
})

async function refresh() {
  devLog('[FileTree] Refresh tree')
  treeNodes.value = await buildNodes(await props.fileAdpoter.list())
}

async function ensureChildren(key) {
  if (loadingKeys.value.has(key)) return
  const node = nodeMap.value.get(key)
  if (!node || node.file) return
  if (node.children && node.children.length > 0) return

  loadingKeys.value.add(key)
  const paths = [...node.paths, node.name]
  const children = await buildNodes(await props.fileAdpoter.list(paths), paths)
  node.children = children
  loadingKeys.value.delete(key)
}

function handleToggle({ key, expanded }) {
  if (expanded) {
    ensureChildren(key)
  }
}

function handleSelect({ node }) {
  options.select = node
}

function resolveIsFile(item) {
  if (!item || typeof item !== 'object') return false
  if (typeof item.isFile === 'function') return item.isFile()
  if (typeof item.isFile === 'boolean') return item.isFile
  if (typeof item.file === 'boolean') return item.file
  if (typeof item.type === 'number') return item.type === 1
  const symbols = Object.getOwnPropertySymbols(item)
  const typeSymbol = symbols.find((symbol) => symbol.description === 'type')
  if (typeSymbol) return item[typeSymbol] === 1
  return false
}

function resolveFileIcon(name, isFile) {
  if (!isFile) return 'i-carbon-folder'
  const ext = String(name || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp'].includes(ext)) return 'i-carbon-image'
  if (['md', 'txt', 'log'].includes(ext)) return 'i-carbon-document'
  if (
    [
      'json',
      'js',
      'ts',
      'yaml',
      'yml',
      'xml',
      'html',
      'css',
      'scss',
      'less',
      'sass',
      'vue'
    ].includes(ext)
  )
    return 'i-carbon-code'
  return 'i-carbon-document'
}

async function buildNodes(array, paths = []) {
  if (!array) return []
  return array.map((item) => {
    const file = resolveIsFile(item)
    const name = item.name
    const key = [...paths, name].join('/')
    return {
      key,
      label: name,
      name,
      paths,
      file,
      leaf: file,
      icon: resolveFileIcon(name, file),
      children: file ? [] : []
    }
  })
}
</script>

<template>
  <div class="FileTree-Wrapper">
    <div class="FileTree-Toolbar">
      <span class="FileTree-Title">
        <RemixIcon name="folder" />
        <span>文件</span>
        {{ options.select?.paths.join('/') }}{{ options.select?.name }}
        <span v-if="options.select?.file">/</span>
      </span>

      <span class="FileTree-Func">
        <IconButton small icon="refresh" @click="refresh" />
      </span>
    </div>
    <TxScroll>
      <!--      <div class="FileTree-Container"> -->

      <TxTree
        v-model="files"
        v-model:expanded-keys="expandedKeys"
        :nodes="treeNodes"
        checkable
        multiple
        @toggle="handleToggle"
        @select="handleSelect"
      />

      <!--      </div> -->
    </TxScroll>
  </div>
</template>

<style lang="scss" scoped>
.FileTree-Wrapper {
  .FileTree-Toolbar {
    .FileTree-Title :deep(.remix) {
      position: relative;
      top: 2px;
      margin-right: 5px;
    }
    position: absolute;
    padding: 0 1%;
    display: flex;

    align-items: center;
    justify-content: space-between;

    top: 0;
    left: 0;
    width: 100%;
    height: 30px;

    border-radius: 4px;
    box-sizing: border-box;
    background-color: var(--tx-fill-color-darker);
  }
  position: relative;
  padding-top: 35px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  //background-color: blue;
  //overflow: hidden;
}

:deep(.tx-tree) {
  background: transparent;
}
</style>
