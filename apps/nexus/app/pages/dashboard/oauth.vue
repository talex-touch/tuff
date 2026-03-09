<script setup lang="ts">
import { TuffInput, TxButton, TxSpinner } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'

defineI18nRoute(false)

type OauthScope = 'team' | 'nexus'

interface TeamSummaryResponse {
  team?: {
    type?: string
    role?: string
  }
}

interface OauthApplication {
  id: string
  clientId: string
  clientSecretHint: string
  name: string
  description: string | null
  redirectUris: string[]
  ownerScope: OauthScope
  ownerUserId: string
  ownerTeamId: string | null
  createdByRole: 'nexus_admin' | 'team_admin'
  status: 'active' | 'revoked'
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

interface CreateOauthApplicationResponse {
  application: OauthApplication & {
    clientSecret: string
  }
  message?: string
}

interface UpdateOauthApplicationResponse {
  application: OauthApplication
}

interface ListOauthApplicationsResponse {
  scope: OauthScope
  applications: OauthApplication[]
}

const { t } = useI18n()
const { user } = useAuthUser()

const { data: teamData, pending: teamPending } = useFetch<TeamSummaryResponse>('/api/dashboard/team')

const isNexusAdmin = computed(() => String(user.value?.role || '').toLowerCase() === 'admin')
const isTeamAdmin = computed(() => {
  const team = teamData.value?.team
  const role = String(team?.role || '').toLowerCase()
  return team?.type === 'organization' && (role === 'owner' || role === 'admin')
})
const canManageOauth = computed(() => isNexusAdmin.value || isTeamAdmin.value)

const scopeOptions = computed<Array<{ value: OauthScope, label: string }>>(() => {
  const options: Array<{ value: OauthScope, label: string }> = []
  if (isTeamAdmin.value) {
    options.push({
      value: 'team',
      label: t('dashboard.sections.oauth.scopeTeam', 'Team Scope'),
    })
  }
  if (isNexusAdmin.value) {
    options.push({
      value: 'nexus',
      label: t('dashboard.sections.oauth.scopeNexus', 'Nexus Scope'),
    })
  }
  return options
})

const activeScope = ref<OauthScope>('team')

watch(
  () => scopeOptions.value,
  (options) => {
    if (!options.some(option => option.value === activeScope.value)) {
      activeScope.value = options[0]?.value || 'team'
    }
  },
  { immediate: true },
)

const applications = ref<OauthApplication[]>([])
const loading = ref(false)
const saving = ref(false)
const updating = ref(false)
const rotatingId = ref<string | null>(null)
const errorMessage = ref('')

const formName = ref('')
const formDescription = ref('')
const formRedirectUris = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingDescription = ref('')
const editingRedirectUris = ref('')

const createdSecret = ref<{
  name: string
  clientId: string
  clientSecret: string
} | null>(null)
const copied = ref(false)

function normalizeErrorMessage(error: any, fallback: string): string {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

function parseRedirectUris(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

async function fetchApplications() {
  if (!canManageOauth.value) {
    applications.value = []
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const data = await $fetch<ListOauthApplicationsResponse>('/api/dashboard/oauth/clients', {
      query: {
        scope: activeScope.value,
      },
    })
    applications.value = data.applications || []
  }
  catch (error: any) {
    errorMessage.value = normalizeErrorMessage(error, t('dashboard.sections.oauth.errors.load', 'Failed to load oauth applications.'))
  }
  finally {
    loading.value = false
  }
}

watch(
  () => [canManageOauth.value, activeScope.value] as const,
  ([allowed]) => {
    if (allowed) {
      void fetchApplications()
    }
    else {
      applications.value = []
      errorMessage.value = ''
    }
  },
  { immediate: true },
)

async function createApplication() {
  const name = formName.value.trim()
  const redirectUris = parseRedirectUris(formRedirectUris.value)
  if (!name || redirectUris.length <= 0) {
    errorMessage.value = t('dashboard.sections.oauth.errors.invalidForm', 'Name and redirect URIs are required.')
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const data = await $fetch<CreateOauthApplicationResponse>('/api/dashboard/oauth/clients', {
      method: 'POST',
      body: {
        scope: activeScope.value,
        name,
        description: formDescription.value.trim(),
        redirectUris,
      },
    })

    createdSecret.value = {
      name: data.application.name,
      clientId: data.application.clientId,
      clientSecret: data.application.clientSecret,
    }

    formName.value = ''
    formDescription.value = ''
    formRedirectUris.value = ''
    await fetchApplications()
  }
  catch (error: any) {
    errorMessage.value = normalizeErrorMessage(error, t('dashboard.sections.oauth.errors.create', 'Failed to create oauth application.'))
  }
  finally {
    saving.value = false
  }
}

function beginEdit(application: OauthApplication) {
  editingId.value = application.id
  editingName.value = application.name
  editingDescription.value = application.description || ''
  editingRedirectUris.value = application.redirectUris.join('\n')
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
  editingDescription.value = ''
  editingRedirectUris.value = ''
}

async function saveEdit(applicationId: string) {
  const name = editingName.value.trim()
  const redirectUris = parseRedirectUris(editingRedirectUris.value)
  if (!name || redirectUris.length <= 0) {
    errorMessage.value = t('dashboard.sections.oauth.errors.invalidForm', 'Name and redirect URIs are required.')
    return
  }

  updating.value = true
  errorMessage.value = ''
  try {
    await $fetch<UpdateOauthApplicationResponse>(`/api/dashboard/oauth/clients/${encodeURIComponent(applicationId)}`, {
      method: 'PATCH',
      body: {
        scope: activeScope.value,
        name,
        description: editingDescription.value.trim(),
        redirectUris,
      },
    })
    cancelEdit()
    await fetchApplications()
  }
  catch (error: any) {
    errorMessage.value = normalizeErrorMessage(error, t('dashboard.sections.oauth.errors.update', 'Failed to update oauth application.'))
  }
  finally {
    updating.value = false
  }
}

async function rotateSecret(application: OauthApplication) {
  rotatingId.value = application.id
  errorMessage.value = ''
  try {
    const data = await $fetch<CreateOauthApplicationResponse>(`/api/dashboard/oauth/clients/${encodeURIComponent(application.id)}/rotate-secret`, {
      method: 'POST',
      body: {
        scope: activeScope.value,
      },
    })
    createdSecret.value = {
      name: data.application.name,
      clientId: data.application.clientId,
      clientSecret: data.application.clientSecret,
    }
    await fetchApplications()
  }
  catch (error: any) {
    errorMessage.value = normalizeErrorMessage(error, t('dashboard.sections.oauth.errors.rotate', 'Failed to rotate oauth secret.'))
  }
  finally {
    rotatingId.value = null
  }
}

async function revokeApplication(applicationId: string) {
  try {
    await $fetch(`/api/dashboard/oauth/clients/${encodeURIComponent(applicationId)}`, {
      method: 'DELETE',
      query: {
        scope: activeScope.value,
      },
    })
    await fetchApplications()
  }
  catch (error: any) {
    errorMessage.value = normalizeErrorMessage(error, t('dashboard.sections.oauth.errors.revoke', 'Failed to revoke oauth application.'))
  }
}

async function copySecret() {
  if (!createdSecret.value) {
    return
  }
  await navigator.clipboard.writeText(createdSecret.value.clientSecret)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1800)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.oauth.title', 'OAuth Applications') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.oauth.subtitle', 'Create and manage OAuth clients for integrations.') }}
      </p>
    </header>

    <p
      v-if="!canManageOauth && !teamPending"
      class="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-200"
    >
      {{ t('dashboard.sections.oauth.forbidden', 'Only team admin or nexus admin can manage OAuth applications.') }}
    </p>

    <template v-else-if="canManageOauth">
      <section class="apple-card-lg p-4 space-y-4">
        <div v-if="scopeOptions.length > 1" class="flex flex-wrap gap-2">
          <TxButton
            v-for="scope in scopeOptions"
            :key="scope.value"
            :variant="activeScope === scope.value ? 'primary' : 'secondary'"
            size="small"
            @click="activeScope = scope.value"
          >
            {{ scope.label }}
          </TxButton>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <div class="space-y-2">
            <p class="text-sm font-medium text-black/75 dark:text-white/75">
              {{ t('dashboard.sections.oauth.form.name', 'Application Name') }}
            </p>
            <TuffInput
              v-model="formName"
              :placeholder="t('dashboard.sections.oauth.form.namePlaceholder', 'e.g. Pilot Integration')"
              size="small"
            />
          </div>
          <div class="space-y-2">
            <p class="text-sm font-medium text-black/75 dark:text-white/75">
              {{ t('dashboard.sections.oauth.form.description', 'Description') }}
            </p>
            <TuffInput
              v-model="formDescription"
              :placeholder="t('dashboard.sections.oauth.form.descriptionPlaceholder', 'Optional short description')"
              size="small"
            />
          </div>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium text-black/75 dark:text-white/75">
            {{ t('dashboard.sections.oauth.form.redirectUris', 'Redirect URIs') }}
          </p>
          <textarea
            v-model="formRedirectUris"
            class="min-h-[120px] w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-primary dark:border-white/[0.15] dark:bg-white/[0.03] dark:text-white"
            :placeholder="t('dashboard.sections.oauth.form.redirectUrisPlaceholder', 'One URI per line, or comma separated')"
          />
        </div>

        <div class="flex items-center gap-3">
          <TxButton variant="primary" :loading="saving" @click="createApplication">
            {{ saving ? t('dashboard.sections.oauth.actions.creating', 'Creating...') : t('dashboard.sections.oauth.actions.create', 'Create OAuth App') }}
          </TxButton>
          <span class="text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.sections.oauth.scopeHint', { scope: activeScope }) }}
          </span>
        </div>
      </section>

      <section v-if="createdSecret" class="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
        <p class="text-sm font-semibold text-green-700 dark:text-green-300">
          {{ t('dashboard.sections.oauth.created.title', { name: createdSecret.name }) }}
        </p>
        <p class="mt-1 text-xs text-green-700/80 dark:text-green-300/80">
          {{ t('dashboard.sections.oauth.created.hint', 'Save the client secret now. It will not be shown again.') }}
        </p>
        <div class="mt-3 grid gap-2 lg:grid-cols-2">
          <code class="rounded-lg bg-black/10 px-3 py-2 text-xs dark:bg-white/10">
            client_id: {{ createdSecret.clientId }}
          </code>
          <code class="rounded-lg bg-black/10 px-3 py-2 text-xs dark:bg-white/10">
            client_secret: {{ createdSecret.clientSecret }}
          </code>
        </div>
        <TxButton class="mt-3" size="small" variant="success" @click="copySecret">
          {{ copied ? t('dashboard.sections.oauth.actions.copied', 'Copied') : t('dashboard.sections.oauth.actions.copySecret', 'Copy Secret') }}
        </TxButton>
      </section>

      <section class="apple-card-lg p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="apple-heading-sm">
            {{ t('dashboard.sections.oauth.listTitle', 'Registered Applications') }}
          </h2>
          <TxButton size="small" variant="secondary" @click="fetchApplications">
            {{ t('common.refresh', 'Refresh') }}
          </TxButton>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-6">
          <TxSpinner :size="20" />
        </div>
        <p v-else-if="errorMessage" class="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {{ errorMessage }}
        </p>
        <div v-else-if="applications.length <= 0" class="rounded-xl border border-dashed border-black/[0.08] px-4 py-8 text-center text-sm text-black/50 dark:border-white/[0.1] dark:text-white/50">
          {{ t('dashboard.sections.oauth.empty', 'No OAuth applications yet.') }}
        </div>
        <div v-else class="space-y-3">
          <article
            v-for="app in applications"
            :key="app.id"
            class="rounded-xl border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.1] dark:bg-white/[0.03]"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="text-base font-semibold text-black dark:text-white">
                  {{ app.name }}
                </p>
                <p class="text-xs text-black/55 dark:text-white/55">
                  client_id: <code>{{ app.clientId }}</code>
                </p>
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ app.description || t('dashboard.sections.oauth.noDescription', 'No description') }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="app.status === 'active'
                    ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                    : 'bg-slate-500/20 text-slate-700 dark:text-slate-300'"
                >
                  {{ app.status }}
                </span>
                <TxButton
                  v-if="app.status === 'active'"
                  size="small"
                  variant="secondary"
                  @click="beginEdit(app)"
                >
                  {{ t('dashboard.sections.oauth.actions.edit', 'Edit') }}
                </TxButton>
                <TxButton
                  v-if="app.status === 'active'"
                  size="small"
                  variant="secondary"
                  :loading="rotatingId === app.id"
                  @click="rotateSecret(app)"
                >
                  {{ rotatingId === app.id
                    ? t('dashboard.sections.oauth.actions.rotating', 'Regenerating...')
                    : t('dashboard.sections.oauth.actions.rotateSecret', 'Regenerate Secret') }}
                </TxButton>
                <TxButton
                  v-if="app.status === 'active'"
                  size="small"
                  variant="danger"
                  @click="revokeApplication(app.id)"
                >
                  {{ t('dashboard.sections.oauth.actions.revoke', 'Revoke') }}
                </TxButton>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-2 text-xs text-black/55 dark:text-white/55">
              <span>{{ t('dashboard.sections.oauth.meta.scope', { scope: app.ownerScope }) }}</span>
              <span>·</span>
              <span>{{ t('dashboard.sections.oauth.meta.createdAt', { date: formatDateTime(app.createdAt) }) }}</span>
              <span>·</span>
              <span>{{ t('dashboard.sections.oauth.meta.lastUsed', { date: formatDateTime(app.lastUsedAt) }) }}</span>
            </div>

            <div
              v-if="editingId === app.id && app.status === 'active'"
              class="mt-3 rounded-xl border border-black/[0.08] p-3 dark:border-white/[0.1]"
            >
              <div class="grid gap-3 lg:grid-cols-2">
                <div class="space-y-2">
                  <p class="text-xs font-medium text-black/70 dark:text-white/70">
                    {{ t('dashboard.sections.oauth.form.name', 'Application Name') }}
                  </p>
                  <TuffInput v-model="editingName" size="small" />
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-black/70 dark:text-white/70">
                    {{ t('dashboard.sections.oauth.form.description', 'Description') }}
                  </p>
                  <TuffInput v-model="editingDescription" size="small" />
                </div>
              </div>
              <div class="mt-3 space-y-2">
                <p class="text-xs font-medium text-black/70 dark:text-white/70">
                  {{ t('dashboard.sections.oauth.form.redirectUris', 'Redirect URIs') }}
                </p>
                <textarea
                  v-model="editingRedirectUris"
                  class="min-h-[88px] w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs text-black outline-none transition focus:border-primary dark:border-white/[0.15] dark:bg-white/[0.03] dark:text-white"
                />
              </div>
              <div class="mt-3 flex items-center gap-2">
                <TxButton size="small" variant="primary" :loading="updating" @click="saveEdit(app.id)">
                  {{ updating ? t('dashboard.sections.oauth.actions.saving', 'Saving...') : t('dashboard.sections.oauth.actions.save', 'Save') }}
                </TxButton>
                <TxButton size="small" variant="secondary" @click="cancelEdit">
                  {{ t('dashboard.sections.oauth.actions.cancel', 'Cancel') }}
                </TxButton>
              </div>
            </div>

            <div class="mt-3 space-y-1">
              <p class="text-xs font-medium text-black/70 dark:text-white/70">
                {{ t('dashboard.sections.oauth.redirectList', 'Redirect URIs') }}
              </p>
              <ul class="space-y-1">
                <li v-for="uri in app.redirectUris" :key="uri" class="text-xs text-black/55 break-all dark:text-white/55">
                  {{ uri }}
                </li>
              </ul>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
