<!--
  SettingMcpServerDetail

  The drawer body for one MCP server: Tuff's own switch, where the server comes from (each agent and
  the configuration file that declares it), what it runs (command, arguments, credential names with
  masked values), and a probe that starts this server alone.

  Read-only toward the agents. Nothing here edits an agent's file; the switch acts on Tuff's own copy
  only, and the probe of a server Tuff does not hold reads the agent's file without importing it.
-->
<script lang="ts" name="SettingMcpServerDetail" setup>
import type { McpServerRow } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type { ResourceRowTag } from '~/components/settings/resources/types'
import type { McpProbeState, McpSwitchModel } from './setting-mcp-display'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { MCP_SECRET_MASK } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentGlyph from '~/components/settings/resources/AgentGlyph.vue'
import { agentBrand } from '~/components/settings/resources/agent-registry'
import SettingChip from '~/components/settings/SettingChip.vue'
import { mcpProbeTarget } from './setting-mcp-display'

const props = defineProps<{
  row: McpServerRow
  switchModel: McpSwitchModel
  /** A switch or import request for this server is in flight. */
  pending: boolean
  /** Why the last attempt to switch it failed, in the page's words. */
  failure?: string
  probe: McpProbeState
  /** The page's tags for this row, shown again at the top of the drawer. */
  tags: readonly ResourceRowTag[]
}>()

const emit = defineEmits<{
  toggle: [value: boolean]
  probe: []
}>()

const { t } = useI18n()
const switchTitleId = useId()

function labelOf(agentId: AiAgentId): string {
  return agentBrand(agentId).label
}

const stateText = computed(() => {
  const { tuff } = props.row
  if (tuff.state === 'enabled') return t('settings.mcpPage.stateEnabled')
  if (tuff.blockedReason === 'reauth-required') return t('settings.mcpPage.blockedReauth')
  if (tuff.blockedReason === 'source-missing') return t('settings.mcpPage.blockedSourceMissing')
  if (tuff.blockedReason === 'invalid') return t('settings.mcpPage.blockedInvalid')
  if (tuff.state === 'disabled') return t('settings.mcpPage.stateDisabled')
  return t('settings.mcpPage.stateNotImported')
})

/**
 * A server Tuff holds is probed through its stored copy; one it does not hold yet, straight from the
 * agent's file that declares it — started alone and stopped after, nothing imported or kept.
 */
const probeTarget = computed(() => mcpProbeTarget(props.row))

const probeText = computed(() => {
  switch (props.probe.status) {
    case 'probing':
      return t('settings.mcpPage.probeRunning')
    case 'ok':
      return t('settings.mcpPage.probeOk', { count: props.probe.toolCount ?? 0 })
    case 'failed':
      return t('settings.mcpPage.probeFailed', { reason: props.probe.error ?? '' })
    default:
      return probeTarget.value?.mode === 'declared'
        ? t('settings.mcpPage.probeIdleDeclared')
        : t('settings.mcpPage.probeIdle')
  }
})

const args = computed(() => props.row.detail.args ?? [])
const hasMaskedValues = computed(
  () =>
    props.row.detail.envNames.length > 0 ||
    props.row.detail.headerNames.length > 0 ||
    args.value.includes(MCP_SECRET_MASK)
)

/** The provider an imported copy came from, when no agent declares the server any more. */
const keptOnlyAgent = computed(() => {
  const { tuff, agents } = props.row
  if (agents.length > 0 || tuff.origin !== 'imported' || !tuff.provider) return null
  return labelOf(tuff.provider)
})
</script>

<template>
  <div class="McpDetail" :data-server-key="row.key">
    <div v-if="tags.length > 0" class="McpDetail-Tags">
      <SettingChip v-for="tag in tags" :key="tag.key ?? tag.label" :tone="tag.tone ?? 'neutral'">
        {{ tag.label }}
      </SettingChip>
    </div>

    <section class="McpDetail-Switch">
      <div class="McpDetail-SwitchText">
        <span :id="switchTitleId" class="McpDetail-SwitchTitle">
          {{ t('settings.mcpPage.enableTitle') }}
        </span>
        <span class="McpDetail-SwitchDesc">{{ stateText }}</span>
        <span v-if="failure" class="McpDetail-Failure" role="alert">{{ failure }}</span>
      </div>
      <TxSwitch
        :model-value="switchModel.checked"
        :disabled="switchModel.mode === 'blocked'"
        :loading="pending"
        :aria-labelledby="switchTitleId"
        @update:model-value="(value) => emit('toggle', Boolean(value))"
      />
    </section>

    <section class="McpDetail-Section">
      <h3>{{ t('settings.mcpPage.sourcesTitle') }}</h3>
      <ul class="McpDetail-Sources">
        <li
          v-for="source in row.agents"
          :key="`${source.agentId}:${source.sourcePath}`"
          class="McpDetail-Source"
        >
          <AgentGlyph :agent-id="source.agentId" :size="18" />
          <div class="McpDetail-SourceText">
            <span class="McpDetail-SourceName">{{ labelOf(source.agentId) }}</span>
            <code class="McpDetail-Path">{{ source.sourcePath }}</code>
          </div>
        </li>
        <li v-if="row.tuff.origin === 'manual'" class="McpDetail-Source">
          <span class="McpDetail-SourceIcon i-ri-edit-2-line" aria-hidden="true" />
          <span class="McpDetail-SourceName">{{ t('settings.mcpPage.sourceManual') }}</span>
        </li>
        <li v-else-if="keptOnlyAgent" class="McpDetail-Source">
          <span class="McpDetail-SourceIcon i-ri-archive-line" aria-hidden="true" />
          <span class="McpDetail-SourceName">
            {{ t('settings.mcpPage.sourceKeptOnly', { agent: keptOnlyAgent }) }}
          </span>
        </li>
      </ul>
    </section>

    <section class="McpDetail-Section">
      <h3>{{ t('settings.mcpPage.definitionTitle') }}</h3>
      <dl class="McpDetail-Definition">
        <template v-if="row.transport === 'stdio'">
          <dt>{{ t('settings.mcpPage.command') }}</dt>
          <dd>
            <code class="McpDetail-Code">{{ row.detail.command }}</code>
          </dd>
          <dt>{{ t('settings.mcpPage.args') }}</dt>
          <dd>
            <ol v-if="args.length > 0" class="McpDetail-List">
              <li v-for="(arg, index) in args" :key="index">
                <code class="McpDetail-Code" :class="{ 'is-mask': arg === MCP_SECRET_MASK }">
                  {{ arg }}
                </code>
              </li>
            </ol>
            <span v-else class="McpDetail-None">{{ t('settings.mcpPage.argsNone') }}</span>
          </dd>
        </template>
        <template v-else>
          <dt>{{ t('settings.mcpPage.url') }}</dt>
          <dd>
            <code class="McpDetail-Code">{{ row.detail.url }}</code>
          </dd>
        </template>

        <template v-if="row.detail.envNames.length > 0">
          <dt>{{ t('settings.mcpPage.env') }}</dt>
          <dd>
            <ul class="McpDetail-List">
              <li v-for="name in row.detail.envNames" :key="name" class="McpDetail-Secret">
                <code class="McpDetail-Code">{{ name }}</code>
                <code class="McpDetail-Code is-mask">{{ MCP_SECRET_MASK }}</code>
              </li>
            </ul>
          </dd>
        </template>

        <template v-if="row.detail.headerNames.length > 0">
          <dt>{{ t('settings.mcpPage.headers') }}</dt>
          <dd>
            <ul class="McpDetail-List">
              <li v-for="name in row.detail.headerNames" :key="name" class="McpDetail-Secret">
                <code class="McpDetail-Code">{{ name }}</code>
                <code class="McpDetail-Code is-mask">{{ MCP_SECRET_MASK }}</code>
              </li>
            </ul>
          </dd>
        </template>
      </dl>
      <p v-if="hasMaskedValues" class="McpDetail-Note">{{ t('settings.mcpPage.maskedNote') }}</p>
    </section>

    <section class="McpDetail-Section">
      <div class="McpDetail-ProbeHead">
        <h3>{{ t('settings.mcpPage.probeTitle') }}</h3>
        <TxButton
          variant="secondary"
          size="sm"
          :disabled="!probeTarget"
          :loading="probe.status === 'probing'"
          @click="emit('probe')"
        >
          {{ t('settings.mcpPage.probeAction') }}
        </TxButton>
      </div>
      <p
        class="McpDetail-Probe"
        :class="{
          'is-ok': probe.status === 'ok',
          'is-failed': probe.status === 'failed'
        }"
        role="status"
      >
        {{ probeText }}
      </p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.McpDetail {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5);
  color: var(--shell-text-primary);
}

.McpDetail-Tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.McpDetail-Switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-4);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
}

.McpDetail-SwitchText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.McpDetail-SwitchTitle {
  font-size: var(--shell-fs-md);
  font-weight: 500;
}

.McpDetail-SwitchDesc {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.McpDetail-Failure {
  color: var(--shell-danger);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.McpDetail-Section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);

  h3 {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    font-weight: 600;
  }
}

.McpDetail-Sources {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.McpDetail-Source {
  display: flex;
  align-items: flex-start;
  gap: var(--shell-space-3);
}

.McpDetail-SourceIcon {
  display: inline-flex;
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--shell-text-secondary);
}

.McpDetail-SourceText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.McpDetail-SourceName {
  font-size: var(--shell-fs-body);
  line-height: 18px;
}

.McpDetail-Path {
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  overflow-wrap: anywhere;
  user-select: text;
}

.McpDetail-Definition {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--shell-space-2) var(--shell-space-4);
  margin: 0;

  dt {
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    line-height: 22px;
  }

  dd {
    min-width: 0;
    margin: 0;
  }
}

.McpDetail-List {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.McpDetail-Secret {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.McpDetail-Code {
  display: inline-block;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 18px;
  overflow-wrap: anywhere;
  user-select: text;

  &.is-mask {
    color: var(--shell-text-secondary);
    user-select: none;
  }
}

.McpDetail-None {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 22px;
}

.McpDetail-Note {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.McpDetail-ProbeHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3);
}

.McpDetail-Probe {
  margin: 0;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.is-ok {
    color: var(--shell-success);
  }

  &.is-failed {
    color: var(--shell-danger);
  }
}
</style>
