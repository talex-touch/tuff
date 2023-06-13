<template>
  <div class="FileTree-Wrapper">
    <div class="FileTree-Toolbar">
      <span class="FileTree-Title">
        <remix-icon name="folder" />
        <span>文件</span>
        {{ options.select?.paths.join("/") }}{{ options.select?.name }}
        <span v-if="options.select?.file">/</span>
      </span>

      <span class="FileTree-Func">
        <IconButton @click="refresh" small icon="refresh" />
      </span>
    </div>
    <el-scrollbar>
<!--      <div class="FileTree-Container">-->

        <el-tree @currentChange="currentChange" ref="treeDom" @check-change="click" :props="{label: 'name', children: 'children', isLeaf: 'leaf' }" :load="loadNode" lazy show-checkbox>
          <template #default="{ node, data }">
              <span class="FileTree-Item">
                <span class="File-Icon">
                  <remix-icon v-if="data.suffix.t === 'r'" :name="data.suffix.n" />
                  <span v-else-if="data.suffix.t === 'u'">{{ data.suffix }}</span>
                  <remix-icon v-else name="folder" />
                </span>
                <span>{{ node.label }}</span>
              </span>
          </template>
        </el-tree>

<!--      </div>-->
    </el-scrollbar>
  </div>
</template>

<script name="FileTree" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref';
import RemixIcon from "@comp/icon/RemixIcon.vue";
import IconButton from "@comp/base/button//IconButton.vue";

const props = defineProps(['fileAdpoter', 'modelValue'])
const emit = defineEmits(['update:modelValue'])

const treeDom = ref()
const options = reactive({
  select: null
})
const files = useModelWrapper(props, emit)

onMounted(() => {
  watchEffect(() => {
    if ( !treeDom.value ) return

    [ ...props.modelValue ].forEach(item => {
      const node = treeDom.value.getNode(item)
      if ( node ) treeDom.value.setChecked(node, true)
    })
  })
})

function currentChange(val) { options.select = val }

let _resolve, g_node
async function refresh() {
  if ( !g_node || !_resolve ) return
  console.log( treeDom.value )

  g_node.childNodes = []
  console.log( g_node )
  _resolve(item2Obj(await props.fileAdpoter.list()))
}

function click() {
  const _files = []
  treeDom.value.getCheckedNodes().forEach(node => {
    const data = treeDom.value.getNode(node)
    _files.push([ ...data.data.paths, data.data.name ].join("/"))
  })

  files.value = _files
}

async function loadNode(node, resolve) {
  if ( !node.parent ) {
    g_node = node
    _resolve = resolve
    return resolve(item2Obj(await props.fileAdpoter.list()))
  }

  const _p = []
  let _node = node
  while( _node.parent ) {
    if ( _node.data.name )
      _p.push( _node.data.name )

    _node = _node.parent
  }

  resolve(item2Obj(await props.fileAdpoter.list(_p.reverse()), _p))
}

function suffix2Icon(suffix) {
  if ( !suffix || suffix.length < 2 ) return ''
  const s = String(suffix.pop()).toLowerCase()

  const mapper = {
    'json': 'braces',
    'js': 'javascript',
    'ts': 'javascript',
    'yaml': 'file-code',
    'yml': 'file-code',
    'iml': 'file-code',
    'xml': 'file-code',
    'html': 'html5',
    'svg': 'image',
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'webp': 'image',
    'git': 'git-repository',
    'gitignore': 'git-commit',
    'idea': 'file-shield-2',
    'vscode': 'file-shield-2',
    'pnpm': 'file-shield-2',
    'bin': 'file-shield-2',
    'vite': 'file-shield-2',
    'dockerignore': 'file-shield-2',
    'editorconfig': 'file-shield-2',
    'prettierrc': 'file-shield-2',
    'husky': 'file-shield-2',
    'npmignore': 'npm',
    'github': 'github',
    'md': 'markdown',
    'vue': 'vuejs',
    'css': 'css3',
    'less': 'css3',
    'scss': 'css3',
    'sass': 'css3',
  }

  const t = mapper[s] ? { t: 'r', n: mapper[s] } : { t: 'u' }

  return {
    s, ...t
  }
}

function item2Obj(array, paths = []) {
  if ( !array ) return []
  const t = []

  array.forEach(item => {
    t.push({
      name: item.name,
      file: item[Symbol('type')] === 1,
      suffix: suffix2Icon(item.name.split(".")),
      children: [],
      paths
    })
  })

  return t
}
</script>

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
    background-color: var(--el-fill-color-darker);
  }
  position: relative;
  padding-top: 35px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  //background-color: blue;
  //overflow: hidden;
}

:deep(.el-tree) {
  .FileTree-Item {
    .File-Icon {
      position: relative;
      top: 2px;

      margin-right: 5px;
    }
  }
  background: transparent;

  --el-tree-node-hover-bg-color: #ffffff80
}
</style>