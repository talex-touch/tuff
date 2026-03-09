<script setup lang="ts">
import QrCode from 'qrcode'

const url = ref()
const invitationCode = ref()

onMounted(async () => {
  // 邀请码就是用户id加密串
  const userId = `${userStore.value.id}`

  invitationCode.value = btoa(userId).replaceAll('=', '')

  // url.value = await QrCode.toDataURL(`${location.origin}/invitation?code=${invitationCode.value}&source=web`, { margin: 2 })
  url.value = await QrCode.toDataURL(`https://ai.quotawish.com/invitation?code=Mjc&source=web`)
})
</script>

<template>
  <div class="Invitation">
    <p>邀请返利</p>

    <div class="Invitation-Main">
      <div class="Invitation-List">
        <p>你邀请了0个人</p>

        <!-- <el-table /> -->
      </div>
      <div class="Invitation-Code">
        <div w-full flex items-center justify-center>
          <div i-carbon:scan-alt />扫码同意邀请
        </div>
        <img :src="url" alt="InvitationCode">
        <p>
          邀请码：{{ invitationCode }}
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.Invitation {
  &-List {
    position: relative;
    flex: 1;

    width: 50%;
  }
  &-Code {
    position: relative;
    & > p {
      width: 100%;

      text-align: center;
    }
    img {
      position: relative;

      // width: 100%;
      height: 100%;

      border-radius: 16px;
      border: 1px solid var(--el-border-color);
    }
    display: flex;

    // flex: 1;

    // width: 50%;
    height: 100%;

    gap: 0.25rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  &-Main {
    position: relative;
    display: flex;

    gap: 1rem;
    width: 100%;
    height: calc(100% - 27px);
    // align-items: center;
    justify-content: space-between;
  }
  & > p {
    position: relative;

    font-size: 18px;
    font-weight: 600;
  }
  position: relative;
  display: flex;
  padding: 1rem;

  flex-direction: column;

  width: 100%;
  height: 270px;

  border-radius: 12px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
}
</style>
