<script setup lang="ts">
import dayjs from 'dayjs'
import ChatLinkShare from '~/components/chat/head/ChatLinkShare.vue'
import { getHistoryList } from '~/composables/api/account'
import { $endApi } from '~/composables/api/base'
import AccountModuleDeveloper from './account/AccountModuleDeveloper.vue'
import AccountModuleDummy from './account/AccountModuleDummy.vue'
import AccountModuleHistory from './account/AccountModuleHistory.vue'
import AccountModuleInvitation from './account/AccountModuleInvitation.vue'
import AccountModuleLink from './account/AccountModuleLink.vue'
import AccountModulePersonal from './account/AccountModulePersonal.vue'
import AccountModulePlan from './account/AccountModulePlan.vue'
import AccountModuleSignIn from './account/AccountModuleSignIn.vue'

const historyList = ref()
const invitationList = ref()
const shareList = ref()
const signinData = ref<{
  data: any
  daily: any
}>({
  data: null,
  daily: null,
})

async function fetchSigninData() {
  const date = new Date()
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const res: any = await $endApi.v1.account.signinCalendar(year, month)

  if (res.code !== 200)
    return ElMessage.error(res.message)

  signinData.value.data = res.data
}

async function fetchHistoryData() {
  const res: any = await getHistoryList()

  if (res.code !== 200)
    return ElMessage.error(res.message)

  historyList.value = res.data
}

async function fetchInvitationData() {
  const res: any = await $endApi.v1.account.getInvitationRecords()

  if (res.code !== 200)
    return ElMessage.error(res.message)

  invitationList.value = res.data
}

async function fetchShareListData() {
  const res: any = await $endApi.v1.aigc.getShareList()

  if (res.code !== 200)
    return ElMessage.error(res.message)

  shareList.value = res.data
}

onMounted(() => {
  fetchSigninData()
  fetchHistoryData()
  fetchInvitationData()
  fetchShareListData()
})

// 计算注册了多少天
const registeredCountDay = computed(() => {
  const diff = Date.now() - new Date(userStore.value.createdAt!).getTime()

  return Math.round(diff / 60 / 1000 / 60 / 24)
})

function handleLogout() {
  logoutPilotSession()
}

const dialogOptions = reactive<{
  visible: boolean
  loading: boolean
  component: any
  data: any
}>({
  visible: false,
  loading: false,
  component: null,
  data: null,
})

async function openHistoryPage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModuleHistory,
    data: historyList.value,
  })
}

async function openConfigurePage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModulePersonal,
    data: null,
  })
}

async function openInvitationPage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModuleInvitation,
    data: invitationList.value,
  })
}

async function openPlanPage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModulePlan,
    data: null,
  })
}

async function openDummyPage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModuleDummy,
    data: null,
  })
}

const shareRef = useTypedRef(ChatLinkShare)
async function handleShareMenu(share: any) {
  dialogOptions.loading = true

  dialogOptions.visible = true

  const { value } = share
  const content = decodeObject(value)

  const res = await $endApi.v1.aigc.getConversation(content.id)

  if (responseMessage(res, { success: '', triggerOnDataNull: false })) {
    dialogOptions.data = { ...res.data, id: res.data.chat_id, lastUpdate: new Date(res.data.updatedAt).getTime() }

    sleep(200).then(() => shareRef.value?.openShareDialog())
  }

  dialogOptions.loading = false
  dialogOptions.visible = false
}

const isSignedToday = computed(() => {
  if (!signinData.value.data)
    return false

  const { data } = signinData.value.data

  const list = data.split('')

  return list?.[dayjs().date() - 1]
})

async function handleDailySignin() {
  const res = await $endApi.v1.account.dailySignin()

  if (responseMessage(res, { success: '签到成功！', triggerOnDataNull: false })) {
    fetchSigninData()

    signinData.value.daily = res.data

    const { amount } = res.data

    const dummy = (amount + 1) * 10
    const award = (amount + 1) % 7 === 0 ? 2000 : ((amount + 1) % 3 === 0 ? 1000 : 0)

    ElMessageBox.alert(`奖励 ${dummy} 云点 ${award !== 0 ? (`${(award / 100).toFixed(2)}元优惠券x1 (有效期3天)`) : ''}`, '签到成功', {
      confirmButtonText: '了解',
    })
  }
}

function openSignPage() {
  Object.assign(dialogOptions, {
    visible: true,
    component: AccountModuleSignIn,
    data: signinData.value.data,
  })
}
</script>

<template>
  <div class="ProfileAccount">
    <div style="--d: 0.1s" class="ProfileAccount-Box">
      <div class="ProfileAccount-Box-Header template-normal">
        <div class="image">
          <div i-carbon:user />
        </div>
        <div flex class="title">
          我的账号
        </div>
        <p class="subtitle">
          您的账号信息、订阅计划信息等
        </p>
      </div>

      <div class="ProfileAccount-Box-Main">
        <div v-if="userStore" class="template-normal">
          <div class="image">
            <!-- <ImageUpload v-model="userStore.avatar!" /> -->
            <PersonalUserAvatar :avatar="userStore.avatar!" />
          </div>
          <div flex cursor-pointer items-center gap-2 class="title">
            <p v-copy="userStore.nickname" hover:underline>
              {{ userStore.nickname }}
            </p>
            <div v-if="false" i-carbon:edit op-50 hover:op-75 />
          </div>
          <p class="subtitle">
            {{ userStore.remark || '酷酷的人没有签名' }}
          </p>

          <div class="daily-signin">
            <el-button v-if="isSignedToday" type="success" @click="openSignPage">
              已签到{{ signinData.data?.amount }}天
            </el-button>
            <el-button v-else type="primary" @click="handleDailySignin">
              今天还未签到
            </el-button>
          </div>
        </div>

        <div class="ProfileAccount-Tags">
          <span v-if="!userStore.isAdmin" class="tag danger fill">管理员
          </span>
          <span v-else class="tag fill">普通用户</span>
          <span v-wave cursor-pointer class="tag" @click="openInvitationPage">已邀请 {{ invitationList?.length || 0 }}
            人</span>
          <span class="tag">注册 {{ registeredCountDay }} 天</span>
        </div>

        <div class="ProfileAccount-Box-Data">
          <div v-wave class="box-data" @click="openDummyPage">
            <div class="title">
              <p>钱包余额</p>
              <div i-carbon:cloud />
            </div>

            <p>
              <template v-if="userStore.dummy">
                {{ userStore.dummy.availablePoints || 0 }}
                <span v-if="userStore.dummy.freezedPoints" text-xs op-50>
                  ({{ userStore.dummy.freezedPoints }}点 已过期)
                </span>
              </template>
              <template v-else>
                -
              </template>
            </p>
          </div>
          <div v-wave class="box-data" @click="openPlanPage">
            <div class="title">
              <p>订阅计划</p>
              <div i-carbon:document-multiple-01 />
            </div>

            <p>
              <span v-if="!userStore.subscription">暂无</span>
              <span v-else-if="userStore.subscription.type === 'STANDARD'">
                标准订阅
              </span>
              <span v-else-if="userStore.subscription.type === 'ULTIMATE'">
                高级订阅
              </span>

              <span v-if="userStore.subscription" mx-1 text-3 op-75>
                至{{ dayjs(userStore.subscription.expiredAt).format('YYYY/MM/DD') }}
              </span>
              <span v-else mx-1 text-3 op-75>
                <el-link href="/plan" target="_blank">立即订阅</el-link>
              </span>
            </p>
          </div>
          <div v-wave class="box-data" @click="openHistoryPage">
            <div class="title">
              <p>登录历史</p>
              <div i-carbon-data-table />
            </div>

            <p>
              <span font-bold underline>{{ historyList?.items.length || 0 }}</span> 条记录
            </p>
          </div>
        </div>
      </div>

      <div class="ProfileAccount-Box-Footer">
        <el-button v-wave type="primary" @click="openConfigurePage">
          <div i-carbon-settings />&nbsp;&nbsp;配置
        </el-button>
        <el-button v-wave type="danger" @click="handleLogout">
          <div i-carbon-exit />&nbsp;&nbsp;登出
        </el-button>
      </div>
    </div>

    <div style="--d: 0.2s" class="ProfileAccount-Box">
      <div class="ProfileAccount-Box-Header template-normal">
        <div class="image">
          <div i-carbon-moon />
        </div>
        <div flex class="title">
          外观配置
        </div>
        <p class="subtitle">
          您的个性化配置，在不同设备间同步。
        </p>
      </div>

      <div class="ProfileAccount-Box-Main">
        <ChorePersonalProfileAccountModuleAppearance />
      </div>
    </div>

    <div style="--d: 0.3s" class="ProfileAccount-Box">
      <div class="ProfileAccount-Box-Header template-normal">
        <div class="image">
          <div i-carbon:link />
        </div>
        <div flex class="title">
          QuotaWish 相关账号管理
        </div>
        <p class="subtitle">
          您的第三方相关账号绑定信息等
        </p>
      </div>

      <div class="ProfileAccount-Box-Main">
        <AccountModuleLink />
      </div>

      <!-- <div class="ProfileAccount-Box-Footer">
        <el-button v-wave type="primary">
          <div i-carbon-document-attachment />&nbsp;&nbsp;管理
        </el-button>
      </div> -->
    </div>

    <div style="--d: 0.4s" class="ProfileAccount-Box">
      <div class="ProfileAccount-Box-Header template-normal">
        <div class="image">
          <div i-carbon-share />
        </div>
        <div flex class="title">
          分享管理
        </div>
        <p class="subtitle">
          查看，管理您的历史对话分享记录
        </p>
      </div>

      <div style="max-height: 500px" class="ProfileAccount-Box-Main">
        <div v-if="shareList?.items.length" class="Share">
          <el-scrollbar>
            <div v-for="share in shareList?.items" :key="share.id" class="Share-Item">
              <p class="title">
                {{ share.topic }}
              </p>

              <div class="fixed-right">
                <div v-wave class="icon" @click="handleShareMenu(share)">
                  <div i-carbon-overflow-menu-horizontal />
                </div>
                <div v-if="false" v-wave class="icon" @click="handleShareMenu">
                  <div i-carbon-close />
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
        <template v-else>
          <el-empty description="暂无任何分享记录" />
        </template>

        <ChatHeadChatLinkShare ref="shareRef" v-model="dialogOptions.data" />
      </div>
    </div>

    <div style="--d: 0.5s" class="ProfileAccount-Box">
      <div class="ProfileAccount-Box-Header template-normal">
        <div class="image">
          <div i-carbon-code />
        </div>
        <div flex class="title">
          开发者设置
        </div>
        <p class="subtitle">
          您的全局账号API设置等
        </p>
      </div>

      <div class="ProfileAccount-Box-Main">
        <AccountModuleDeveloper />
      </div>
    </div>

    <br>

    <DialogTouchDialog v-model="dialogOptions.visible" :loading="dialogOptions.loading">
      <template #Main>
        <component :is="dialogOptions.component" v-if="dialogOptions.component" :data="dialogOptions.data" />
      </template>
    </DialogTouchDialog>
  </div>
</template>

<style lang="scss">
.Share-Item {
  .fixed-right {
    .icon {
      &:hover {
        background-color: #ffffff30;
      }
      display: flex;

      align-items: center;
      justify-content: center;

      width: 32px;
      height: 32px;

      font-size: 20px;
      border-radius: 8px;
      // &:last-child {
      //   color: var(--el-color-danger);
      // }
    }

    display: flex;

    height: 100%;

    gap: 0.5rem;
    align-items: center;
  }
  &:hover {
    background-color: var(--el-fill-color-light);
  }
  display: flex;
  margin: 0.5rem 0;
  padding: 0.5rem 1rem;

  width: 100%;

  cursor: pointer;

  align-items: center;
  justify-content: space-between;

  border-radius: 12px;
  background-color: var(--el-fill-color-lighter);
}

.ProfileAccount {
  .daily-signin {
    position: absolute;

    right: 1rem;
  }
  position: relative;

  width: 100%;
  height: 100%;
}
</style>
