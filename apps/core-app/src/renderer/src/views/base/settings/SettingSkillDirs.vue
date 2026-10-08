<!--
  SettingSkillDirs

  The skill directories drawer: every directory Tuff reads skills from. The ones detected on this
  machine belong to the agents and the shared libraries, and are listed read-only; the ones the user
  added can be removed, which only unlinks them — the files stay where they are.

  Presentational: the page owns the reads and writes, and this body reports what the user asked for.
-->
<script lang="ts" name="SettingSkillDirs" setup>
import type { LocalSkillDirView } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import { TxButton } from '@talex-touch/tuffex/button'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentGlyph from '~/components/settings/resources/AgentGlyph.vue'
import { agentBrand } from '~/components/settings/resources/agent-registry'
import { STORAGE_LABEL_KEYS } from './setting-skills-display'

const props = defineProps<{
  dirs: readonly LocalSkillDirView[]
  /** A directory is being added or removed; the controls wait for it. */
  busy: boolean
}>()

const emit = defineEmits<{
  remove: [path: string]
}>()

const { t } = useI18n()

/** Detected roots that are storage rather than an agent, named as the skill rows name them. */
const STORAGE_ROOTS: Readonly<Record<string, string>> = {
  'cc-switch': STORAGE_LABEL_KEYS['cc-switch'],
  agents: STORAGE_LABEL_KEYS['agents-shared']
}

const detected = computed(() => props.dirs.filter((dir) => dir.auto))
const linked = computed(() => props.dirs.filter((dir) => !dir.auto))

function ownerLabel(sourceId: string | null): string {
  if (!sourceId) return ''
  const storageKey = STORAGE_ROOTS[sourceId]
  return storageKey ? t(storageKey) : agentBrand(sourceId).label
}

/** Storage roots get the folder glyph; an agent's own directory gets the agent's. */
function isAgentRoot(sourceId: string | null): sourceId is string {
  return Boolean(sourceId) && !STORAGE_ROOTS[sourceId as string]
}
</script>

<template>
  <div class="SkillDirs">
    <p class="SkillDirs-Intro">{{ t('settings.skillsPage.dirsIntro') }}</p>

    <section class="SkillDirs-Section" data-testid="skill-dirs-linked">
      <h3>{{ t('settings.skillsPage.dirsLinked') }}</h3>
      <ul v-if="linked.length > 0" class="SkillDirs-List">
        <li v-for="dir in linked" :key="dir.path" class="SkillDirs-Item" :data-dir-path="dir.path">
          <span class="SkillDirs-Icon i-ri-folder-3-line" aria-hidden="true" />
          <div class="SkillDirs-Text">
            <code class="SkillDirs-Path">{{ dir.path }}</code>
            <span class="SkillDirs-Count">
              {{ t('settings.skillsPage.dirCount', { count: dir.skillCount }) }}
            </span>
          </div>
          <TxButton
            variant="secondary"
            size="sm"
            :disabled="busy"
            :aria-label="t('settings.skillsPage.dirRemoveLabel', { path: dir.path })"
            @click="emit('remove', dir.path)"
          >
            {{ t('settings.skillsPage.dirRemove') }}
          </TxButton>
        </li>
      </ul>
      <p v-else class="SkillDirs-None">{{ t('settings.skillsPage.dirsLinkedEmpty') }}</p>
    </section>

    <section class="SkillDirs-Section" data-testid="skill-dirs-detected">
      <h3>{{ t('settings.skillsPage.dirsDetected') }}</h3>
      <ul v-if="detected.length > 0" class="SkillDirs-List">
        <li
          v-for="dir in detected"
          :key="dir.path"
          class="SkillDirs-Item"
          :data-dir-path="dir.path"
        >
          <AgentGlyph v-if="isAgentRoot(dir.sourceId)" :agent-id="dir.sourceId" :size="18" />
          <span v-else class="SkillDirs-Icon i-ri-folder-shared-line" aria-hidden="true" />
          <div class="SkillDirs-Text">
            <span class="SkillDirs-Owner">{{ ownerLabel(dir.sourceId) }}</span>
            <code class="SkillDirs-Path">{{ dir.path }}</code>
            <span class="SkillDirs-Count">
              {{ t('settings.skillsPage.dirCount', { count: dir.skillCount }) }}
            </span>
          </div>
        </li>
      </ul>
      <p v-else class="SkillDirs-None">{{ t('settings.skillsPage.dirsDetectedEmpty') }}</p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.SkillDirs {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5);
  color: var(--shell-text-primary);
}

.SkillDirs-Intro {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SkillDirs-Section {
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

.SkillDirs-List {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  list-style: none;
}

.SkillDirs-Item {
  display: flex;
  align-items: flex-start;
  gap: var(--shell-space-3);
  padding: 10px 14px;

  & + & {
    border-top: 1px solid var(--shell-border);
  }
}

.SkillDirs-Icon {
  display: inline-flex;
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--shell-text-secondary);
}

.SkillDirs-Text {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.SkillDirs-Owner {
  font-size: var(--shell-fs-body);
  line-height: 18px;
}

.SkillDirs-Path {
  color: var(--shell-text-primary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 18px;
  overflow-wrap: anywhere;
  user-select: text;
}

.SkillDirs-Count,
.SkillDirs-None {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}
</style>
