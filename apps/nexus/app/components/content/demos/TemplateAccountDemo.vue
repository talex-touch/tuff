<script setup lang="ts">
// Account center template: a profile header over tabs for profile, security,
// sessions and notifications. Every value lives in one reactive object so a
// tab switch never forgets an edit. Destructive actions (removing sessions,
// turning off two-factor sign-in) open a confirmation modal that only the
// reader's click can approve; no timer ever confirms them on the reader's behalf.
import { computed, defineComponent, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type TabKey = 'profile' | 'security' | 'sessions' | 'notifications'
type Mode = 'narrow' | 'column' | 'wide'
type ConfirmKind = 'remove-one' | 'remove-others' | 'disable-2fa'
type ToastKey = 'profileSaved' | 'removed' | 'othersRemoved' | 'twoFactorOff'

interface Bi { zh: string, en: string }

interface Session {
  id: string
  device: Bi
  app: string
  location: Bi
  minutesAgo: number
  current: boolean
}

interface Profile {
  displayName: string
  bio: string
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured width into a ref, so the column set and tab placement can follow it.
const StageSize = defineComponent({
  name: 'StageSize',
  props: { width: { type: Number, default: 0 } },
  emits: { resize: (_width: number) => true },
  setup(props, { emit }) {
    watch(() => props.width, width => emit('resize', width), { immediate: true })
    return () => null
  },
})

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

// Sample identity only: an invented name and a reserved example.com address.
const NAME: Bi = { zh: '林澈', en: 'Lin Che' }
const EMAIL = 'lin.che@example.com'
const USERNAME = 'lin_che'

// Sessions store how long ago they were active, so relative times need no clock.
function seedSessions(): Session[] {
  return [
    { id: 's-this', device: { zh: 'MacBook Pro', en: 'MacBook Pro' }, app: 'Tuff 2.4 · macOS', location: { zh: '上海', en: 'Shanghai' }, minutesAgo: 0, current: true },
    { id: 's-win', device: { zh: 'Windows 工作站', en: 'Windows workstation' }, app: 'Tuff 2.4 · Windows', location: { zh: '杭州', en: 'Hangzhou' }, minutesAgo: 190, current: false },
    { id: 's-ipad', device: { zh: 'iPad Air', en: 'iPad Air' }, app: 'Safari · iPadOS', location: { zh: '东京', en: 'Tokyo' }, minutesAgo: 60 * 24 * 3, current: false },
  ]
}

const copy = computed(() => zh.value
  ? {
      frameTitle: '账户中心',
      verified: '邮箱已验证',
      lastSignIn: (t: string) => `上次登录 ${t}`,
      tabs: { profile: '资料', security: '安全', sessions: '会话', notifications: '通知' } as Record<TabKey, string>,
      tabIcons: { profile: 'i-carbon-user', security: 'i-carbon-security', sessions: 'i-carbon-devices', notifications: 'i-carbon-notification' } as Record<TabKey, string>,
      profile: { name: '显示名称', username: '用户名', email: '邮箱', bio: '简介', save: '保存资料', nameHint: '最多 24 个字符', bioHint: '显示在个人页上' },
      security: { twoFactor: '双重验证', twoFactorDesc: '登录时再输入一次验证器中的代码', on: '已开启 · 验证器 App', off: '未开启', password: '密码', passwordDesc: '3 个月前修改', change: '修改密码' },
      sessions: { current: '本机', remove: '删除', device: '设备', app: '应用', location: '位置', lastActive: '最近活动', actions: '操作', now: '正在使用', danger: '危险操作区', dangerDesc: '删除其他会话后，对应设备需要重新登录。', removeOthers: (n: number) => `删除其他 ${n} 个会话` },
      notifications: { product: '产品更新', productDesc: '新版本与功能预告', security: '安全提醒', securityDesc: '异常登录始终发送，不能关闭', digest: '每周摘要', digestDesc: '每周一汇总你的插件与评论', replies: '评论回复', repliesDesc: '有人回复你的评论时通知' },
      modal: {
        cancel: '取消',
        removeOne: { title: '删除这个会话？', body: (device: string) => `「${device}」会立即退出，需要重新登录。` },
        removeOthers: { title: '删除其他会话？', body: (n: number) => `将退出其余 ${n} 台设备，本机保持登录。` },
        disable2fa: { title: '关闭双重验证？', body: '关闭后只需密码即可登录，账户安全性会降低。' },
        confirm: { removeOne: '删除', removeOthers: '全部删除', disable2fa: '关闭' },
      },
      toast: { profileSaved: '资料已保存', removed: '会话已删除', othersRemoved: '其他会话已删除', twoFactorOff: '双重验证已关闭' } as Record<ToastKey, string>,
      minutes: (n: number) => n < 1 ? '刚刚' : n < 60 ? `${n} 分钟前` : n < 60 * 24 ? `${Math.round(n / 60)} 小时前` : `${Math.round(n / 60 / 24)} 天前`,
    }
  : {
      frameTitle: 'Account',
      verified: 'Email verified',
      lastSignIn: (t: string) => `last signed in ${t}`,
      tabs: { profile: 'Profile', security: 'Security', sessions: 'Sessions', notifications: 'Notifications' } as Record<TabKey, string>,
      tabIcons: { profile: 'i-carbon-user', security: 'i-carbon-security', sessions: 'i-carbon-devices', notifications: 'i-carbon-notification' } as Record<TabKey, string>,
      profile: { name: 'Display name', username: 'Username', email: 'Email', bio: 'Bio', save: 'Save profile', nameHint: 'Up to 24 characters', bioHint: 'Shown on your public profile' },
      security: { twoFactor: 'Two-factor sign-in', twoFactorDesc: 'Ask for a code from your authenticator on sign-in', on: 'On · authenticator app', off: 'Off', password: 'Password', passwordDesc: 'Changed 3 months ago', change: 'Change password' },
      sessions: { current: 'This device', remove: 'Remove', device: 'Device', app: 'App', location: 'Location', lastActive: 'Last active', actions: 'Actions', now: 'In use', danger: 'Danger zone', dangerDesc: 'Other devices sign in again after their session is removed.', removeOthers: (n: number) => `Remove ${n} other sessions` },
      notifications: { product: 'Product updates', productDesc: 'New releases and feature previews', security: 'Security alerts', securityDesc: 'Unusual sign-ins always send and cannot be turned off', digest: 'Weekly digest', digestDesc: 'A Monday summary of your plugins and replies', replies: 'Comment replies', repliesDesc: 'Notify me when someone replies to my comment' },
      modal: {
        cancel: 'Cancel',
        removeOne: { title: 'Remove this session?', body: (device: string) => `${device} is signed out right away and must sign in again.` },
        removeOthers: { title: 'Remove other sessions?', body: (n: number) => `${n} other devices are signed out. This device stays signed in.` },
        disable2fa: { title: 'Turn off two-factor sign-in?', body: 'Your password alone will be enough to sign in, which lowers account security.' },
        confirm: { removeOne: 'Remove', removeOthers: 'Remove all', disable2fa: 'Turn off' },
      },
      toast: { profileSaved: 'Profile saved', removed: 'Session removed', othersRemoved: 'Other sessions removed', twoFactorOff: 'Two-factor sign-in off' } as Record<ToastKey, string>,
      minutes: (n: number) => n < 1 ? 'just now' : n < 60 ? `${n} min ago` : n < 60 * 24 ? `${Math.round(n / 60)} h ago` : `${Math.round(n / 60 / 24)} d ago`,
    })

const tab = ref<TabKey>('profile')
const profile = reactive<Profile>({ displayName: '', bio: '' })
const sessions = ref<Session[]>(seedSessions())
const twoFactor = ref(true)
const notify = reactive({ product: true, security: true, digest: true, replies: false })

const confirmOpen = ref(false)
const confirmKind = ref<ConfirmKind>('remove-one')
const pendingId = ref<string | null>(null)
const pendingLabel = ref('')

const toastOpen = ref(false)
const toastKey = ref<ToastKey>('profileSaved')
let toastTimer: ReturnType<typeof setTimeout> | undefined

// Width of the frame's body, not the viewport: the layout follows the stage.
const stageWidth = ref(0)

function onStageResize(width: number): void {
  stageWidth.value = width
}

const mode = computed<Mode>(() => {
  const w = stageWidth.value
  if (!w)
    return 'column'
  if (w < 640)
    return 'narrow'
  return w < 960 ? 'column' : 'wide'
})

const tabPlacement = computed(() => (mode.value === 'narrow' ? 'top' : 'left'))
const otherSessions = computed(() => sessions.value.filter(session => !session.current))

const tableColumns = computed(() => {
  const c = copy.value.sessions
  if (mode.value === 'narrow') {
    return [
      { key: 'device', title: c.device },
      { key: 'actions', title: c.actions, width: 56, align: 'right' as const },
    ]
  }
  return [
    { key: 'device', title: c.device },
    ...(mode.value === 'wide' ? [{ key: 'app', title: c.app, width: 168 }] : []),
    { key: 'location', title: c.location, width: 96 },
    { key: 'lastActive', title: c.lastActive, width: 128 },
    { key: 'actions', title: c.actions, width: 72, align: 'right' as const },
  ]
})

const modal = computed(() => {
  const c = copy.value.modal
  if (confirmKind.value === 'remove-one')
    return { title: c.removeOne.title, body: c.removeOne.body(pendingLabel.value), confirm: c.confirm.removeOne }
  if (confirmKind.value === 'remove-others')
    return { title: c.removeOthers.title, body: c.removeOthers.body(otherSessions.value.length), confirm: c.confirm.removeOthers }
  return { title: c.disable2fa.title, body: c.disable2fa.body, confirm: c.confirm.disable2fa }
})

function showToast(key: ToastKey): void {
  toastKey.value = key
  toastOpen.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastOpen.value = false
  }, 3600)
}

function askRemove(id: string): void {
  const session = sessions.value.find(item => item.id === id)
  pendingId.value = id
  pendingLabel.value = session ? L(session.device) : ''
  confirmKind.value = 'remove-one'
  confirmOpen.value = true
}

function askRemoveOthers(): void {
  pendingId.value = null
  confirmKind.value = 'remove-others'
  confirmOpen.value = true
}

// Turning two-factor off is not a plain toggle: the switch snaps back on, and
// only a confirmed modal lets the value change. The flag marks our own write so
// the watcher does not treat it as another click.
let allowTwoFactorOff = false

watch(twoFactor, (next, previous) => {
  if (allowTwoFactorOff) {
    allowTwoFactorOff = false
    return
  }
  if (next || !previous)
    return
  twoFactor.value = true
  confirmKind.value = 'disable-2fa'
  confirmOpen.value = true
})

function confirmAction(): void {
  if (confirmKind.value === 'remove-one' && pendingId.value) {
    const id = pendingId.value
    sessions.value = sessions.value.filter(session => session.id !== id)
    showToast('removed')
  }
  else if (confirmKind.value === 'remove-others') {
    sessions.value = sessions.value.filter(session => session.current)
    showToast('othersRemoved')
  }
  else if (confirmKind.value === 'disable-2fa') {
    allowTwoFactorOff = true
    twoFactor.value = false
    showToast('twoFactorOff')
  }
  confirmOpen.value = false
  pendingId.value = null
}

function saveProfile(): void {
  showToast('profileSaved')
}

function resetDemo(): void {
  clearTimeout(toastTimer)
  toastOpen.value = false
  confirmOpen.value = false
  pendingId.value = null
  tab.value = 'profile'
  profile.displayName = L(NAME)
  profile.bio = ''
  sessions.value = seedSessions()
  twoFactor.value = true
  Object.assign(notify, { product: true, security: true, digest: true, replies: false })
}

resetDemo()

// A language switch restarts the sample data, so the copy never mixes languages.
watch(locale, resetDemo)

// The toast timer is the only timer here; release it with the component.
onBeforeUnmount(() => {
  clearTimeout(toastTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="620">
    <template #default="{ width: stageSlotWidth }">
      <div class="account">
        <StageSize :width="stageSlotWidth" @resize="onStageResize" />

        <header class="account__head">
          <TxAvatar :name="L(NAME)" :size="56" />
          <div class="account__who">
            <strong class="account__name">{{ L(NAME) }}</strong>
            <span class="account__mail">{{ EMAIL }}</span>
            <span class="account__meta">
              <TxStatusBadge size="sm" :text="copy.verified" status="success" icon="i-carbon-checkmark-filled" />
              <span class="account__muted">{{ copy.lastSignIn(copy.minutes(12)) }}</span>
            </span>
          </div>
        </header>

        <TxTabs v-model="tab" :placement="tabPlacement" :content-padding="0" borderless indicator-variant="block">
          <TxTabItemGroup name="Account">
            <TxTabItem name="profile" :icon-class="copy.tabIcons.profile">
              <template #name>
                {{ copy.tabs.profile }}
              </template>
              <div class="account__panel">
                <TuffInput v-model="profile.displayName" :aria-label="copy.profile.name" :placeholder="copy.profile.nameHint" />
                <TuffInput :model-value="USERNAME" :aria-label="copy.profile.username" readonly />
                <TuffInput :model-value="EMAIL" :aria-label="copy.profile.email" readonly />
                <TxTextarea v-model="profile.bio" :aria-label="copy.profile.bio" :rows="3" resize="none" :placeholder="copy.profile.bioHint" />
                <div class="account__actions">
                  <TxButton variant="primary" size="sm" @click="saveProfile">
                    {{ copy.profile.save }}
                  </TxButton>
                </div>
              </div>
            </TxTabItem>

            <TxTabItem name="security" :icon-class="copy.tabIcons.security">
              <template #name>
                {{ copy.tabs.security }}
              </template>
              <div class="account__panel">
                <TxGroupBlock :name="copy.security.twoFactor" :description="copy.security.twoFactorDesc" default-icon="i-carbon-locked" :collapsible="false">
                  <TxBlockSlot :title="copy.security.twoFactor" :description="twoFactor ? copy.security.on : copy.security.off" default-icon="i-carbon-security">
                    <TuffSwitch v-model="twoFactor" :aria-label="copy.security.twoFactor" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.security.password" :description="copy.security.passwordDesc" default-icon="i-carbon-password">
                    <TxButton size="sm" variant="ghost">
                      {{ copy.security.change }}
                    </TxButton>
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>

            <TxTabItem name="sessions" :icon-class="copy.tabIcons.sessions">
              <template #name>
                {{ copy.tabs.sessions }}
              </template>
              <div class="account__panel">
                <TxDataTable
                  :columns="tableColumns"
                  :data="sessions"
                  row-key="id"
                  table-layout="fixed"
                  sticky-header
                >
                  <template #cell-device="{ row }">
                    <span class="account__device">
                      <span>{{ L(row.device) }}</span>
                      <TxTag v-if="row.current" :label="copy.sessions.current" variant="soft" />
                    </span>
                  </template>
                  <template #cell-app="{ row }">
                    <span class="account__muted">{{ row.app }}</span>
                  </template>
                  <template #cell-location="{ row }">
                    <span class="account__muted">{{ L(row.location) }}</span>
                  </template>
                  <template #cell-lastActive="{ row }">
                    <span class="account__muted">{{ row.current ? copy.sessions.now : copy.minutes(row.minutesAgo) }}</span>
                  </template>
                  <template #cell-actions="{ row }">
                    <TxIconButton
                      v-if="!row.current"
                      icon="i-carbon-trash-can"
                      size="xs"
                      :label="`${copy.sessions.remove} ${L(row.device)}`"
                      @click="askRemove(row.id)"
                    />
                  </template>
                </TxDataTable>

                <TxCard variant="dashed" :padding="16" :radius="14" class="account__danger">
                  <strong class="account__danger-title">{{ copy.sessions.danger }}</strong>
                  <span class="account__muted">{{ copy.sessions.dangerDesc }}</span>
                  <TxButton variant="danger" size="sm" :disabled="otherSessions.length === 0" @click="askRemoveOthers">
                    {{ copy.sessions.removeOthers(otherSessions.length) }}
                  </TxButton>
                </TxCard>
              </div>
            </TxTabItem>

            <TxTabItem name="notifications" :icon-class="copy.tabIcons.notifications">
              <template #name>
                {{ copy.tabs.notifications }}
              </template>
              <div class="account__panel">
                <TxGroupBlock :name="copy.notifications.product" default-icon="i-carbon-notification" :collapsible="false">
                  <TxBlockSlot :title="copy.notifications.product" :description="copy.notifications.productDesc" default-icon="i-carbon-rocket">
                    <TuffSwitch v-model="notify.product" :aria-label="copy.notifications.product" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.notifications.security" :description="copy.notifications.securityDesc" default-icon="i-carbon-security">
                    <TuffSwitch v-model="notify.security" disabled :aria-label="copy.notifications.security" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.notifications.digest" :description="copy.notifications.digestDesc" default-icon="i-carbon-calendar">
                    <TuffSwitch v-model="notify.digest" :aria-label="copy.notifications.digest" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.notifications.replies" :description="copy.notifications.repliesDesc" default-icon="i-carbon-chat">
                    <TuffSwitch v-model="notify.replies" :aria-label="copy.notifications.replies" />
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>
          </TxTabItemGroup>
        </TxTabs>

        <TxModal v-model="confirmOpen" :title="modal.title">
          <p class="account__modal-body">
{{ modal.body }}
</p>
          <template #footer>
            <TxButton size="sm" variant="ghost" @click="confirmOpen = false">
              {{ copy.modal.cancel }}
            </TxButton>
            <TxButton size="sm" variant="danger" @click="confirmAction">
              {{ modal.confirm }}
            </TxButton>
          </template>
        </TxModal>

        <TxToastPanel :open="toastOpen" side="above" :stack="0">
          {{ copy.toast[toastKey] }}
        </TxToastPanel>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.account {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.account__head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.account__who {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.account__name {
  color: var(--tx-text-color-primary, #303133);
  font-size: 16px;
  font-weight: 600;
}

.account__mail,
.account__muted {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.account__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.account__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.account__actions {
  display: flex;
  justify-content: flex-end;
}

.account__device {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.account__danger {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.account__danger-title {
  color: var(--tx-color-danger, #f56c6c);
  font-size: 14px;
}

.account__modal-body {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 14px;
  line-height: 1.6;
}

@container template (max-width: 639px) {
  .account {
    padding: 12px;
  }
}

@container template (min-width: 960px) {
  .account {
    padding: 24px 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .account * {
    transition: none;
  }
}
</style>
