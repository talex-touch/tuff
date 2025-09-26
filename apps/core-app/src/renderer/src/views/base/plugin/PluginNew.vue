<script setup lang="ts" name="PluginNew">
import FormTemplate from '@comp/base/template/FormTemplate.vue'
import BlockTemplate from '@comp/base/template/BlockTemplate.vue'
import BrickTemplate from '@comp/base/template/BrickTemplate.vue'
import LineTemplate from '@comp/base/template/LineTemplate.vue'
import ActionTemplate from '@comp/base/template/ActionTemplate.vue'

import FlatButton from '@comp/base/button/FlatButton.vue'
import FlatInput from '@comp/base/input/FlatInput.vue'
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue'
import TCheckBox from '@comp/base/checkbox/TCheckBox.vue'

import { forTouchTip } from '~/modules/mention/dialog-mention'
import { touchChannel } from '~/modules/channel/channel-core'
import { EnvDetector } from '@talex-touch/utils/renderer/touch-sdk/env'
import { popperMention } from '~/modules/mention/dialog-mention'
import { createVNode } from 'vue'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import type { IManifest } from '@talex-touch/utils/plugin'
import TerminalTemplate from '~/components/addon/TerminalTemplate.vue'

const emits = defineEmits(['close'])

const activeTab = ref<'install' | 'create'>('install')

const installState = reactive({
  source: '',
  hintType: '' as '' | PluginProviderType,
  metadataText: '',
  installing: false,
  status: 'idle' as 'idle' | 'success' | 'error',
  message: '',
  manifest: null as IManifest | undefined,
  provider: '' as '' | PluginProviderType,
  official: false
})

const providerOptions = computed(() =>
  Object.values(PluginProviderType).filter((type) => type !== PluginProviderType.DEV)
)

const providerLabels: Record<PluginProviderType, string> = {
  [PluginProviderType.GITHUB]: 'GitHub',
  [PluginProviderType.NPM]: 'NPM',
  [PluginProviderType.TPEX]: 'TPEX',
  [PluginProviderType.FILE]: '本地文件',
  [PluginProviderType.DEV]: '开发'
}

const installPreview = computed(() => {
  if (!installState.manifest) return []
  const manifest = installState.manifest
  const lines: string[] = []
  if (manifest.name) lines.push(`名称: ${manifest.name}`)
  if (manifest.version) lines.push(`版本: ${manifest.version}`)
  if (manifest.author) lines.push(`作者: ${manifest.author}`)
  return lines
})

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'install') return
    installState.status = 'idle'
    installState.message = ''
    installState.manifest = undefined
    installState.provider = ''
    installState.official = false
  }
)

watch(
  () => [installState.source, installState.metadataText, installState.hintType],
  () => {
    if (installState.status === 'idle' || installState.installing) return
    installState.status = 'idle'
    installState.message = ''
    installState.manifest = undefined
    installState.provider = ''
    installState.official = false
  }
)

// Lifecycle hook to initialize component
onMounted(() => {
  EnvDetector.init(touchChannel)
  envCheck()
})

// Define the structure for plugin data
interface Plugin {
  template: boolean
  name: string
  desc: string
  version: string
  icon: {
    type: string
    value: string
  }
  dev: {
    enable: ComputedRef<boolean>
    address: string
  }
  readme: string
  openInVSC: boolean
  agreement: boolean
}

// Define the structure for environment options
interface EnvOptions {
  node?: {
    type: string
    version?: number[]
    msg?: string
  }
  degit?: {
    type: string
    version?: string
    msg?: string
  }
}

// Reactive plugin data object
const plugin = reactive<Plugin>({
  template: false,
  name: '',
  desc: '',
  version: '0.0.1',
  icon: {
    type: 'class',
    value: 'i-ri-remixicon-line'
  },
  dev: {
    enable: computed(() => !!plugin.dev.address),
    address: ''
  },
  readme: '# Demo Plugin.',
  openInVSC: false,
  agreement: false
})

// Reactive environment options object
const envOptions = reactive<EnvOptions>({})

async function installPluginFromSource(): Promise<void> {
  if (installState.installing) return

  const trimmedSource = installState.source.trim()
  if (!trimmedSource) {
    await forTouchTip('Install Plugin', '请先输入插件来源地址，例如 GitHub 仓库或 .tpex 链接。')
    return
  }

  let metadata: Record<string, unknown> | undefined
  if (installState.metadataText.trim()) {
    try {
      metadata = JSON.parse(installState.metadataText)
    } catch (error) {
      installState.status = 'error'
      installState.message = '元数据需要是合法的 JSON 字符串。'
      return
    }
  }

  installState.installing = true
  installState.status = 'idle'
  installState.message = ''
  installState.manifest = undefined
  installState.provider = ''
  installState.official = false

  try {
    const payload: Record<string, unknown> = {
      source: trimmedSource
    }

    if (installState.hintType) {
      payload.hintType = installState.hintType
    }

    if (metadata) {
      payload.metadata = metadata
    }

    const result: any = await touchChannel.send('plugin:install-source', payload)

    if (result?.status === 'success') {
      installState.status = 'success'
      installState.message = '插件安装成功，可在列表中查看。'
      installState.manifest = result.manifest as IManifest | undefined
      installState.provider = result.provider as PluginProviderType
      installState.official = Boolean(result.official)
      await forTouchTip('插件安装', '插件已成功安装。')
    } else {
      installState.status = 'error'
      installState.message = result?.message || '插件安装失败，请检查来源是否可用。'
    }
  } catch (error: any) {
    console.error('[PluginNew] Failed to install plugin:', error)
    installState.status = 'error'
    installState.message = error?.message || '插件安装遇到异常，请稍后重试。'
  } finally {
    installState.installing = false
  }
}

/**
 * Check environment requirements for plugin creation
 */
async function envCheck(): Promise<void> {
  const nodeVersion = await EnvDetector.getNode()
  if (nodeVersion) {
    const versionParts = nodeVersion.split('.').map(Number)
    if (versionParts[0] < 16) {
      envOptions.node = {
        msg: `Node.js version is too low (v${nodeVersion}), please upgrade it to 16 or higher.`,
        type: 'error'
      }
    } else {
      envOptions.node = {
        type: 'success',
        version: versionParts
      }
    }
  } else {
    envOptions.node = {
      msg: 'Cannot find node.js, please install it first.',
      type: 'error'
    }
  }

  const degitExists = await EnvDetector.getDegit()
  if (degitExists) {
    envOptions.degit = {
      type: 'success',
      version: 'installed'
    }
  } else {
    envOptions.degit = {
      msg: 'Cannot find degit, please install it first.',
      type: 'error'
    }
  }
}

/**
 * Handle plugin creation action
 */
async function createAction(ctx: any): Promise<void> {
  const { checkForm, setLoading } = ctx

  const result = checkForm()

  if (!result) return

  if (!plugin.agreement) {
    await forTouchTip(
      'Attention',
      "You must agree with <i style='color: #4E94B0'>Touch Plugin Development</i> protocol."
    )
    return
  }

  setLoading(true)

  touchChannel.send('plugin:new', plugin)
}

/**
 * Handle degit installation
 */
async function handleInstallDegit(): Promise<void> {
  await popperMention('', () =>
    createVNode(TerminalTemplate, {
      title: 'Installing degit',
      command: 'npm install -g degit'
    })
  )
}
</script>

<template>
  <FormTemplate>
    <template #header>
      <div class="PluginNew-Header">
        <div class="PluginNew-HeaderRow">
          <div
            i-ri-arrow-left-s-line
            class="PluginNew-Back"
            @click="emits('close')"
          />
          <p class="PluginNew-Title">Plugin Workspace</p>
          <div class="PluginNew-TabGroup">
            <FlatButton :primary="activeTab === 'install'" mini @click="activeTab = 'install'">
              <i class="i-ri-download-cloud-2-line" />
              <span>Install</span>
            </FlatButton>
            <FlatButton :primary="activeTab === 'create'" mini @click="activeTab = 'create'">
              <i class="i-ri-flask-line" />
              <span>Develop</span>
            </FlatButton>
          </div>
        </div>
        <span class="PluginNew-Subtitle">
          {{
            activeTab === 'install'
              ? '从 GitHub、NPM、TPEX 或本地文件安装 Touch 插件。'
              : '创建新的插件模板，便于本地开发和调试。'
          }}
        </span>
      </div>
    </template>

    <section v-if="activeTab === 'install'" class="PluginNew-Install">
      <BlockTemplate title="来源信息">
        <div class="InstallForm-Line">
          <label>来源地址</label>
          <FlatInput
            v-model="installState.source"
            placeholder="talex-touch/example-plugin 或 https://github.com/..."
            w="96!"
          />
        </div>
        <div class="InstallForm-Line">
          <label>来源类型提示</label>
          <el-select
            v-model="installState.hintType"
            clearable
            class="InstallSelect"
            placeholder="自动识别"
          >
            <el-option
              v-for="option in providerOptions"
              :key="option"
              :label="providerLabels[option]"
              :value="option"
            />
          </el-select>
        </div>
        <p class="InstallHint">
          支持 GitHub 仓库 / release、NPM 包、.tpex 包或本地压缩包路径。
        </p>
      </BlockTemplate>

      <BlockTemplate title="附加元数据 (可选)">
        <div class="InstallForm-Line">
          <label>JSON</label>
          <FlatInput
            v-model="installState.metadataText"
            :area="true"
            placeholder='{ "tag": "v1.0.0" }'
          />
        </div>
        <p class="InstallHint">用于指定 tag / branch 等额外信息，留空则自动处理。</p>
      </BlockTemplate>

      <BlockTemplate title="执行">
        <div
          v-if="installState.status !== 'idle'"
          class="InstallStatus"
          :class="installState.status"
        >
          <i
            :class="
              installState.status === 'success'
                ? 'i-ri-checkbox-circle-line'
                : 'i-ri-error-warning-line'
            "
          />
          <div>
            <p>{{ installState.message }}</p>
            <p v-if="installState.provider">
              来源类型：
              {{ providerLabels[installState.provider as PluginProviderType] || installState.provider }}
              <span v-if="installState.official" class="InstallStatus-Official">官方</span>
            </p>
            <ul v-if="installPreview.length" class="InstallManifest">
              <li v-for="line in installPreview" :key="line">{{ line }}</li>
            </ul>
          </div>
        </div>

        <div class="InstallActions">
          <FlatButton :primary="true" @click="installPluginFromSource">
            <i v-if="installState.installing" class="i-ri-loader-4-line animate-spin" />
            <span>{{ installState.installing ? 'Installing…' : 'Install Plugin' }}</span>
          </FlatButton>
        </div>
      </BlockTemplate>
    </section>

    <section v-else class="PluginNew-Create">
      <BlockTemplate :disabled="envOptions.degit?.type !== 'success'">
        <template #title>
          Templates
          <span ml-2>
            <span v-if="envOptions.node?.type === 'success'" color="green-2">
              <span relative top=".5" inline-block i-ri-nodejs-fill />{{
                envOptions.node?.version?.join('.')
              }}
            </span>
            <span v-else color="red-4">
              <span relative top=".5" inline-block i-ri-nodejs-fill />{{ envOptions.node?.msg }}
            </span>

            <span mr-2 />

            <span v-if="envOptions.degit?.type === 'success'" color="green-2">
              <span relative top=".5" inline-block i-ri-git-branch-fill />{{
                envOptions.degit?.version
              }}
            </span>
            <span
              v-else
              v-wave
              border-round
              pl-1
              pr-1
              select-none
              cursor-pointer
              color="red-4"
              @click="handleInstallDegit"
            >
              <span relative top=".5" inline-block i-ri-git-branch-fill /> Install degit
            </span>
          </span>
        </template>
        <BrickTemplate>
          <div>
            <div inline-block mr-2 class="i-simple-icons-vuedotjs" />
          </div>
          <span block text-xs>Contains default dev-env, with using Vue3 and Vite.</span>
          <button
            text-xs
            cursor-pointer
            bg-transparent
            class="color-template fake-background"
            border-solid
            border
            rounded
            px-2
            py-1
            my-2
          >
            Download
          </button>
        </BrickTemplate>
        <BrickTemplate>
          <div>
            <div inline-block mr-2 class="i-simple-icons-react" />
          </div>
          <span block text-xs>Contains default dev-env, with using React18 and Vite.</span>
          <button
            text-xs
            cursor-pointer
            bg-transparent
            class="color-template fake-background"
            border-solid
            border
            rounded
            px-2
            py-1
            my-2
          >
            Download
          </button>
        </BrickTemplate>
        <BrickTemplate>
          <div>
            <div inline-block mr-2 class="i-simple-icons-svelte" />
          </div>
          <span block text-xs>Contains default dev-env, with using Svelte3 and Vite.</span>
          <button
            text-xs
            cursor-pointer
            bg-transparent
            class="color-template fake-background"
            border-solid
            border
            rounded
            px-2
            py-1
            my-2
          >
            Download
          </button>
        </BrickTemplate>
      </BlockTemplate>

      <BlockTemplate title="General">
        <LineTemplate
          :msg="() => 'You must input the correct plugin name.'"
          regex='^[^\\\\/:*?"<>|]+(\\.[^\\\\/:*?"<>|]+)*$'
          title="name"
        >
          <FlatInput v-model="plugin.name" w="48!" />
        </LineTemplate>
        <LineTemplate title="icon">
          <FlatInput v-model="plugin.icon.value" w="48!">
            <div h-full :class="plugin.icon.value" />
          </FlatInput>
        </LineTemplate>
        <LineTemplate
          :msg="() => 'You must input the correct plugin version.'"
          regex="^(\d+\.)(\d+\.)(\*|\d+)$"
          title="version"
        >
          <FlatInput v-model="plugin.version" w="48!" />
        </LineTemplate>
        <LineTemplate
          :msg="() => 'You must input the correct plugin dev address.'"
          regex="^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$"
          title="dev-address"
        >
          <FlatInput v-model="plugin.dev.address" w="48!" />
        </LineTemplate>
        <LineTemplate
          :msg="() => 'You must input the correct plugin description.'"
          title="description"
        >
          <FlatInput v-model="plugin.desc" :area="true" w="96!" />
        </LineTemplate>
      </BlockTemplate>

      <BlockTemplate title="Readme">
        <FlatMarkdown v-model="plugin.readme" />
      </BlockTemplate>

      <BlockTemplate title="Actions">
        <TCheckBox v-model="plugin.openInVSC" text-sm
          >Open in
          <i>
            <div inline-block style="width: 16px" class="i-simple-icons-visualstudio" />
            VSCode
          </i></TCheckBox
        >
        <TCheckBox v-model="plugin.agreement" text-sm
          >Agree with <i>Touch Plugin Development</i></TCheckBox
        >
        <div flex relative mt-8 gap-4 w-4>
          <FlatButton hover:bg-red> Cancel </FlatButton>
          <ActionTemplate :action="createAction">
            <FlatButton :primary="true"> Create </FlatButton>
          </ActionTemplate>
        </div>
      </BlockTemplate>
    </section>
  </FormTemplate>
</template>

<style scoped lang="scss">
.PluginNew-Header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.PluginNew-HeaderRow {
  display: flex;
  align-items: center;
  gap: 16px;
}

.PluginNew-Back {
  cursor: pointer;
  font-size: 24px;
  transition: opacity 0.25s;

  &:hover {
    opacity: 0.75;
  }
}

.PluginNew-Title {
  font-size: 22px;
  font-weight: 700;
  flex: 1;
}

.PluginNew-TabGroup {
  display: flex;
  gap: 8px;
}

.PluginNew-TabGroup :deep(.FlatButton-Container) {
  min-width: 0;
  padding: 0 12px;
}

.PluginNew-Subtitle {
  color: var(--el-text-color-secondary);
}

.PluginNew-Install,
.PluginNew-Create {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.InstallForm-Line {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.InstallSelect {
  width: 320px;
  max-width: 100%;
}

.InstallHint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.InstallStatus {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  align-items: flex-start;

  &.success {
    background: rgba(64, 158, 255, 0.12);
    color: var(--el-color-primary);
  }

  &.error {
    background: rgba(245, 108, 108, 0.12);
    color: var(--el-color-error);
  }

  i {
    font-size: 20px;
    margin-top: 2px;
  }

  p {
    margin-bottom: 4px;
  }
}

.InstallStatus-Official {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(103, 194, 58, 0.15);
  color: var(--el-color-success);
}

.InstallManifest {
  margin-top: 4px;
  padding-left: 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.InstallActions {
  display: flex;
  justify-content: flex-start;
}

.InstallActions :deep(.FlatButton-Container) {
  min-width: 180px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
