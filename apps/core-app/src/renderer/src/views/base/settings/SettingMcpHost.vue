<!--
  SettingMcpHost Component

  Tuff as an MCP server for the other agents on this machine. The MCP servers list above it on the
  settings page configures the servers Tuff talks to; this is the other direction of the same wire,
  Tuff being talked to. Every row is a property of one listener — its address, its credential, and
  which of Tuff's tools it is allowed to publish.

  Drawn as the page's second section: a heading, then one card of rows, the same card the server
  list uses. Only the frame changed with the list's redesign; every behaviour below is the one the
  security contract pins (`agent-tool-gateway-contracts.md`, "Tuff As An MCP Server").
-->
<script lang="ts" name="SettingMcpHost" setup>
import type { McpHostState } from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxRowSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { useMcpHostSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { errorMessage } from './setting-ai-import-shared'

const { t } = useI18n()
const mcpHostSdk = useMcpHostSdk()
const mcpHostLog = createRendererLogger('SettingMcpHost')
const headingId = useId()

const mcpHost = ref<McpHostState | null>(null)
const hostBusy = ref(false)
const hostTokenRevealed = ref(false)
const hostPortDraft = ref('')
/**
 * A state read that failed is not the same as a host that is switched off. Left
 * unrecorded, the section would show "Off" next to a switch reading false — a
 * claim about a listener nobody asked.
 */
const hostLoadFailed = ref(false)

/**
 * Only the first read draws a skeleton. A retry after a failed read keeps the
 * failure row on screen rather than swapping it back out for placeholders, so
 * this flag never returns to false once the first answer has landed.
 *
 * The listener is off until the user turns it on (`mcp-host-settings.ts`), and the
 * address, port, token, tool and client-config rows exist only for an enabled one.
 * Which of the two a read will return cannot be known before it does, so the
 * placeholder is the one row every state draws: the switch. The heading above the
 * card is static and is drawn for real in both states.
 */
const hostLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hostLoaded.value)

const hostRunning = computed(() => mcpHost.value?.running === true)
/** The listener rows describe a running endpoint, and only once the state is known. */
const hostReady = computed(() => !hostLoadFailed.value && mcpHost.value?.enabled === true)
const enabledHostToolCount = computed(
  () => (mcpHost.value?.tools ?? []).filter((tool) => tool.enabled).length
)
/** Nothing to list while the listener is off: the rows describe a running endpoint. */
const hostTools = computed(() => (mcpHost.value?.enabled ? (mcpHost.value.tools ?? []) : []))

/**
 * A listener can be switched on and still not be bound — a taken port is exactly that — so the
 * status line says which of the two the user is looking at rather than leaving them to guess.
 */
const hostStatusDescription = computed(() => {
  const state = mcpHost.value
  if (!state) return t('settings.skillsMcp.host.loading')
  if (state.lastError) return t('settings.skillsMcp.host.errorDesc', { reason: state.lastError })
  if (!state.enabled) return t('settings.skillsMcp.host.enableDesc')
  if (!state.running) return t('settings.skillsMcp.host.startingDesc')
  return t('settings.skillsMcp.host.runningDesc', { count: enabledHostToolCount.value })
})

/** The token is a credential: shown as its own length, and only in full on request. */
const hostTokenDisplay = computed(() => {
  const token = mcpHost.value?.token ?? ''
  return token ? '•'.repeat(Math.min(token.length, 32)) : '—'
})

/**
 * What a client pastes. Written as the `mcpServers` block the common clients read, so it is a
 * paste rather than four fields to transcribe by hand.
 */
function buildClientConfig(endpoint: string | null, token: string): string {
  if (!endpoint || !token) return ''
  return JSON.stringify(
    {
      mcpServers: {
        tuff: {
          type: 'http',
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    },
    null,
    2
  )
}

/** The real document, for the clipboard. */
const hostClientConfig = computed(() => {
  const state = mcpHost.value
  return buildClientConfig(state?.endpoint ?? null, state?.token ?? '')
})

/**
 * The same document with the credential masked, for the screen. A snippet that carries the token in
 * plain text would make the masked row above it theatre, and this page is the one place the token is
 * meant to be readable only on request.
 */
const hostClientConfigDisplay = computed(() => {
  const state = mcpHost.value
  const token = state?.token ?? ''
  return buildClientConfig(
    state?.endpoint ?? null,
    hostTokenRevealed.value ? token : hostTokenDisplay.value
  )
})

function hostRiskTone(risk: 'read' | 'write' | 'execute'): 'neutral' | 'warning' | 'danger' {
  if (risk === 'write') return 'warning'
  if (risk === 'execute') return 'danger'
  return 'neutral'
}

async function loadMcpHost(): Promise<void> {
  try {
    mcpHost.value = await mcpHostSdk.getState()
    hostLoadFailed.value = false
  } catch (error) {
    // No toast: the section renders its own unavailable state, and a failure
    // here must not look like the MCP servers above failing to load.
    hostLoadFailed.value = true
    mcpHostLog.error('Failed to load the local MCP server state', error)
  } finally {
    hostLoaded.value = true
  }
}

async function runHostCommand(
  command: () => Promise<McpHostState>,
  failureKey: string
): Promise<void> {
  if (hostBusy.value) return
  hostBusy.value = true
  try {
    mcpHost.value = await command()
  } catch (error) {
    mcpHostLog.error('Local MCP server command failed', error)
    toast.error(errorMessage(error, t(failureKey)))
  } finally {
    hostBusy.value = false
  }
}

function toggleMcpHost(enabled: boolean): void {
  void runHostCommand(() => mcpHostSdk.setEnabled(enabled), 'settings.skillsMcp.host.toggleFailed')
}

function setHostTool(name: string, enabled: boolean): void {
  void runHostCommand(
    () => mcpHostSdk.setToolEnabled(name, enabled),
    'settings.skillsMcp.host.toolFailed'
  )
}

function rotateHostToken(): void {
  // Re-armed: a rotation the user did not ask to look at must not leave the new
  // credential displayed, and the reveal is a deliberate gesture for one token.
  hostTokenRevealed.value = false
  void runHostCommand(() => mcpHostSdk.rotateToken(), 'settings.skillsMcp.host.rotateFailed')
}

function applyHostPort(): void {
  const port = Number(hostPortDraft.value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    toast.error(t('settings.skillsMcp.host.portInvalid'))
    hostPortDraft.value = String(mcpHost.value?.port ?? '')
    return
  }
  void runHostCommand(() => mcpHostSdk.setPort(port), 'settings.skillsMcp.host.portFailed')
}

async function copyHostValue(value: string, successKey: string): Promise<void> {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t(successKey))
  } catch (error) {
    mcpHostLog.error('Clipboard write failed', error)
    toast.error(t('settings.skillsMcp.host.copyFailed'))
  }
}

watch(
  () => mcpHost.value?.port,
  (port) => {
    if (typeof port === 'number') hostPortDraft.value = String(port)
  },
  { immediate: true }
)

onMounted(() => {
  void loadMcpHost()
})
</script>

<template>
  <!--
    An editor or terminal agent on this machine can call the tools listed below, and every call
    still lands on the confirmation prompt the home conversation uses — so nothing here can run
    without the user seeing it first.
  -->
  <section class="SettingMcpHost" :aria-labelledby="headingId" data-testid="mcp-host">
    <header class="SettingMcpHost-Head">
      <h2 :id="headingId">{{ t('settings.skillsMcp.host.label') }}</h2>
      <p>{{ t('settings.mcpPage.hostDesc') }}</p>
    </header>

    <!-- The one row every state draws, in the card the loaded rows use. -->
    <div v-if="showSkeleton" class="SettingMcpHost-Card" aria-hidden="true">
      <TxRowSkeleton :rows="1" description trailing />
    </div>

    <div v-else class="SettingMcpHost-Card">
      <!-- A read that failed says so, rather than borrowing the stopped look. -->
      <SettingRow
        v-if="hostLoadFailed"
        :title="t('settings.skillsMcp.host.loadFailed')"
        :description="t('settings.skillsMcp.host.loadFailedDesc')"
      >
        <template #trailing>
          <TxButton variant="secondary" size="sm" @click="loadMcpHost">
            {{ t('settings.skillsMcp.retry') }}
          </TxButton>
        </template>
      </SettingRow>

      <SettingRow
        v-else
        :title="t('settings.skillsMcp.host.enableTitle')"
        :description="hostStatusDescription"
      >
        <template #trailing>
          <SettingChip :tone="hostRunning ? 'success' : 'neutral'">
            {{
              hostRunning
                ? t('settings.skillsMcp.host.running')
                : t('settings.skillsMcp.host.stopped')
            }}
          </SettingChip>
          <TxSwitch
            :model-value="mcpHost?.enabled ?? false"
            :disabled="hostBusy"
            @update:model-value="(value) => toggleMcpHost(Boolean(value))"
          />
        </template>
      </SettingRow>

      <SettingRow
        v-if="hostReady"
        :title="t('settings.skillsMcp.host.endpointTitle')"
        :description="t('settings.skillsMcp.host.endpointDesc')"
      >
        <template #trailing>
          <code class="SettingsMcpHost-Code">{{ mcpHost?.endpoint ?? '—' }}</code>
          <TxButton
            variant="secondary"
            size="sm"
            :disabled="!mcpHost?.endpoint"
            @click="
              copyHostValue(mcpHost?.endpoint ?? '', 'settings.skillsMcp.host.endpointCopied')
            "
          >
            {{ t('settings.skillsMcp.host.copy') }}
          </TxButton>
        </template>
      </SettingRow>

      <SettingRow
        v-if="hostReady"
        :title="t('settings.skillsMcp.host.portTitle')"
        :description="t('settings.skillsMcp.host.portDesc')"
      >
        <template #trailing>
          <TxInput
            v-model="hostPortDraft"
            class="SettingsMcpHost-Port"
            @keyup.enter="applyHostPort"
          />
          <TxButton size="sm" :loading="hostBusy" @click="applyHostPort">
            {{ t('settings.skillsMcp.host.apply') }}
          </TxButton>
        </template>
      </SettingRow>

      <SettingRow
        v-if="hostReady"
        :title="t('settings.skillsMcp.host.tokenTitle')"
        :description="t('settings.skillsMcp.host.tokenDesc')"
      >
        <template #trailing>
          <code class="SettingsMcpHost-Code">
            {{ hostTokenRevealed ? mcpHost?.token : hostTokenDisplay }}
          </code>
          <TxButton variant="secondary" size="sm" @click="hostTokenRevealed = !hostTokenRevealed">
            {{
              hostTokenRevealed
                ? t('settings.skillsMcp.host.hide')
                : t('settings.skillsMcp.host.reveal')
            }}
          </TxButton>
          <TxButton
            variant="secondary"
            size="sm"
            @click="copyHostValue(mcpHost?.token ?? '', 'settings.skillsMcp.host.tokenCopied')"
          >
            {{ t('settings.skillsMcp.host.copy') }}
          </TxButton>
          <TxButton variant="secondary" size="sm" :loading="hostBusy" @click="rotateHostToken">
            {{ t('settings.skillsMcp.host.rotate') }}
          </TxButton>
        </template>
      </SettingRow>

      <!-- One row per tool. Everything that writes, opens or runs arrives switched off. -->
      <SettingRow
        v-for="tool in hostTools"
        :key="tool.name"
        :title="tool.name"
        :description="tool.description"
      >
        <template #trailing>
          <SettingChip :tone="hostRiskTone(tool.risk)">
            {{ t(`settings.skillsMcp.host.risk.${tool.risk}`) }}
          </SettingChip>
          <TxSwitch
            :model-value="tool.enabled"
            @update:model-value="(value) => setHostTool(tool.name, Boolean(value))"
          />
        </template>
      </SettingRow>

      <!-- What a client pastes: masked on screen, the real document on the clipboard. -->
      <div v-if="hostReady && hostClientConfig" class="SettingMcpHost-Config">
        <div class="SettingMcpHost-ConfigHead">
          <div class="SettingMcpHost-ConfigText">
            <h3>{{ t('settings.skillsMcp.host.configTitle') }}</h3>
            <p>{{ t('settings.skillsMcp.host.configDesc') }}</p>
          </div>
          <TxButton
            variant="secondary"
            size="sm"
            @click="copyHostValue(hostClientConfig, 'settings.skillsMcp.host.configCopied')"
          >
            {{ t('settings.skillsMcp.host.copy') }}
          </TxButton>
        </div>
        <pre class="SettingsMcpHost-Snippet">{{ hostClientConfigDisplay }}</pre>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.SettingMcpHost {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--shell-space-3);
  // Separates the second section from the server list above more than its own parts are separated.
  margin-top: var(--shell-space-4);
}

.SettingMcpHost-Head {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1);

  h2 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-lg);
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    line-height: 1.5;
  }
}

/*
 * The same card as the server list: one border and radius around rows that draw only the hairline
 * between themselves. Every child of the card is a row, the config block included.
 */
.SettingMcpHost-Card {
  overflow: hidden;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  --tx-skeleton-base-color: var(--shell-surface-2);
  --tx-skeleton-row-separator-color: var(--shell-border);

  > * + * {
    border-top: 1px solid var(--shell-border);
  }
}

.SettingMcpHost-Config {
  padding: 12px 16px;
}

.SettingMcpHost-ConfigHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.SettingMcpHost-ConfigText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;

  h3 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: 13.5px;
    font-weight: 400;
  }

  p {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    line-height: 1.5;
  }
}
/*
 * The address and the token are read character by character before being copied, so they are set in
 * a monospace face with the long ones allowed to scroll rather than wrap the row.
 */
.SettingsMcpHost-Code {
  max-width: 320px;
  overflow-x: auto;
  padding: 3px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-sm);
  white-space: nowrap;
}

.SettingsMcpHost-Port {
  width: 104px;
}

.SettingsMcpHost-Snippet {
  max-height: 240px;
  margin: 10px 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  white-space: pre;
}
</style>
