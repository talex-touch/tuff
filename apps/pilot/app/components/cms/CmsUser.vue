<script setup lang="ts">
import ItemModelSelector from '../chat/addon/ItemModelSelector.vue'

const pageOptions = inject<any>('appOptions')!
function openPersonalSetting() {
  pageOptions.model.personal = 'index'
}
</script>

<template>
  <div class="CmsUser cms-card">
    <div class="CmsUser-Header cms-header">
      <div class="CmsUser-Background">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
          <path
            fill="currentColor" fill-opacity="1"
            d="M0,96L12,106.7C24,117,48,139,72,154.7C96,171,120,181,144,165.3C168,149,192,107,216,80C240,53,264,43,288,37.3C312,32,336,32,360,80C384,128,408,224,432,256C456,288,480,256,504,224C528,192,552,160,576,154.7C600,149,624,171,648,176C672,181,696,171,720,138.7C744,107,768,53,792,80C816,107,840,213,864,261.3C888,309,912,299,936,288C960,277,984,267,1008,240C1032,213,1056,171,1080,170.7C1104,171,1128,213,1152,234.7C1176,256,1200,256,1224,213.3C1248,171,1272,85,1296,48C1320,11,1344,21,1368,58.7C1392,96,1416,160,1428,192L1440,224L1440,320L1428,320C1416,320,1392,320,1368,320C1344,320,1320,320,1296,320C1272,320,1248,320,1224,320C1200,320,1176,320,1152,320C1128,320,1104,320,1080,320C1056,320,1032,320,1008,320C984,320,960,320,936,320C912,320,888,320,864,320C840,320,816,320,792,320C768,320,744,320,720,320C696,320,672,320,648,320C624,320,600,320,576,320C552,320,528,320,504,320C480,320,456,320,432,320C408,320,384,320,360,320C336,320,312,320,288,320C264,320,240,320,216,320C192,320,168,320,144,320C120,320,96,320,72,320C48,320,24,320,12,320L0,320Z"
          />
        </svg>
      </div>

      <div v-if="userStore.avatar" class="CmsUser-Content">
        <PersonalUserAvatar :avatar="userStore.avatar" />

        <div class="CmsUser-Name">
          <p class="title">
            {{ userStore.nickname }}
            <span op-75>
              {{ userStore.status === 1 ? '（已认证）' : '' }}
            </span>
          </p>
          <p class="desc">
            {{ userStore.remark || '酷酷的人没有签名' }}
          </p>
        </div>

        <div class="CmsUser-Fav" @click="openPersonalSetting">
          <div i-carbon:settings />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.CmsUser-Name {
  display: flex;
  flex-direction: column;
  justify-content: center;

  color: #fff;

  .title {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  .desc {
    opacity: 0.75;
    font-size: 12px;
    color: var(--color-text-secondary);
  }
}

.CmsUser-Background {
  position: absolute;

  width: 100%;
  height: 100%;

  bottom: calc(-5px - 0.5rem);

  opacity: 0.25;
}

.CmsUser-Header {
  .CmsUser-Fav {
    position: absolute;

    right: 1.5rem;

    color: #fff;
    font-weight: 600;

    cursor: pointer;
    // font-size: 1.25rem;
  }

  .CmsUser-Content {
    z-index: 1;
    padding: 1rem 1.5rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;
  }
  position: relative;

  color: var(--theme-color-light);
  background: linear-gradient(
    to left,
    var(--theme-color) 60%,
    var(--theme-color-light)
  );
  // background-color: var(--theme-color);
}

.CmsUser {
  padding: 0;
}
</style>
