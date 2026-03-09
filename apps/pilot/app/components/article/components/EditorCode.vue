<script setup lang="ts">
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

// import 'highlight.js/styles/vs2015.css'
const props = defineProps(['node', 'selected'])

const langs = [
  'c',
  'cpp',
  'java',
  'python',
  'jsx',
  'tsx',
  'csharp',
  'go',
  'php',
  'ruby',
  'rust',
  'sql',
  'xml',
  'yaml',
  'json5',
  'makefile',
  'bash',
  'vue',
  'scss',
  'text',
  'typescript',
  'javascript',
  'html',
  'css',
  'json',
  'markdown',
]

const did = ref(false)
const renderOptions = reactive({
  dialog: {
    svg: false,
    html: false,
  },
})

function handleCopy() {
  navigator.clipboard.writeText(props.node.textContent)

  did.value = true

  setTimeout(() => {
    did.value = false
  }, 1000)
}

const lang = computed(() => props.node.attrs.language)
const pre = ref()
watch(() => props.node.textContent, (code) => {
  nextTick(() => {
    // console.log('a', props.node.textContent)

    const res = hljs.highlight(code, {
      language: (lang.value && langs.includes(lang.value)) ? lang.value : 'text',
    })

    console.log('e', res)

    pre.value.innerHTML = res.value
  })
}, { immediate: true })

console.log('p', props)
</script>

<template>
  <div class="EditorCode" :class="{ selected }">
    <div class="EditorCode-Header">
      <div flex items-center gap-1 class="rich-lang">
        <div v-if="lang === 'html'" i-carbon:html />
        <div v-else-if="lang === 'json'" i-carbon:json />
        <div v-else-if="lang === 'vue'" i-carbon:logo-vue />
        <div v-else-if="lang && lang.includes('sql')" i-carbon:sql />
        <div v-else-if="lang === 'xml'" i-carbon:xml />
        <div v-else-if="lang === 'svg'" i-carbon:svg />
        <p v-else>
          <template v-if="lang">
            {{ lang }}
          </template>
          <template v-else>
            <div i-carbon:code />
          </template>
        </p>
      </div>
      <div :class="{ did }" class="rich-copy" @click="handleCopy">
        <span class="un">
          复制
        </span>
        <span class="did">已复制!</span>
      </div>
    </div>
    <div class="EditorCode-Content">
      <pre ref="pre" :spellcheck="false"><code /></pre>

      <div class="EditorCode-ContentFav">
        <div v-if="lang === 'html'" class="render-html" @click="renderOptions.dialog.html = true">
          <el-tooltip content="渲染">
            <div i-carbon:html />
          </el-tooltip>
        </div>
        <div v-if="lang === 'svg'" class="render-html" @click="renderOptions.dialog.svg = true">
          <el-tooltip content="渲染">
            <div i-carbon:svg />
          </el-tooltip>
        </div>
      </div>
    </div>

    <el-dialog v-model="renderOptions.dialog.html" center append-to-body title="渲染结果">
      <div class="HtmlRender">
        <div class="innerRender" v-html="props.node.textContent" />
      </div>
    </el-dialog>

    <el-dialog v-model="renderOptions.dialog.svg" center append-to-body title="渲染结果">
      <div class="SvgRender">
        <div class="innerRender" v-html="props.node.textContent" />
      </div>
    </el-dialog>
  </div>
</template>

<style lang="scss">
.HtmlRender,
.SvgRender {
  position: relative;
  padding: 1rem;

  border-radius: 12px;
  border: 1px solid var(--el-border-color);
}

.EditorCode-ContentFav {
  position: absolute;

  right: 1rem;
  bottom: 0.5rem;

  cursor: pointer;
}

.selected {
  outline: blue solid 1px;
}

.EditorCode {
  &-Header {
    z-index: 1;
    position: sticky;
    padding: 0 1rem;
    display: flex;

    top: 0;

    align-items: center;
    justify-content: space-between;

    width: 100%;
    height: 40px;

    border-radius: 10px 10px 0 0;
    background-color: var(--el-bg-color-page);
  }

  &-Content {
    pre {
      height: 100%;
      .hljs-subst {
        color: var(--el-text-color-placeholder);
      }
    }
    position: relative;
    padding: 0.5rem 1rem;

    border-radius: 0 0 10px 10px;
    background-color: var(--el-fill-color-lighter);
  }

  display: flex;
  margin: 1rem 0;

  flex-direction: column;

  .rich-copy .did {
    position: absolute;

    top: 0;
    right: 0;

    opacity: 0;
    transition: 0.25s;
    transform: translateX(5px);
  }

  .rich-copy .un {
    position: absolute;

    top: 0;
    right: 0;

    transition: 0.25s;
    transform: translateX(0);
  }

  .rich-copy.did .un {
    opacity: 0;
    transform: translateX(-5px);
  }

  .rich-copy.did {
    width: 60px;
  }

  .rich-copy.did .did {
    opacity: 1;
    transform: translateX(0);
  }

  .rich-copy {
    position: relative;

    width: 50px;
    height: 25px;
    line-height: 28px;

    // color: var(--el-text-color-secondary);
    opacity: 0.75;
    font-size: 14px;
    cursor: pointer;
    // overflow: hidden;
    // user-select: none;
    border-radius: 4px;
    transition: all 0.2s;
    // background-color: var(--el-color-primary-light-9);
  }

  .rich-copy:hover {
    opacity: 1;
    cursor: pointer;
  }

  .rich-lang {
    position: relative;

    opacity: 0.75;
  }
}
</style>
