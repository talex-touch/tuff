<template>
  <div class="AppLayout-Container Flat fake-background">
    <div class="AppLayout-Header">
      <div class="AppLayout-Icon">
        <img src="../../../assets/logo.svg" alt="logo">
        <span @click="applicationUpgrade">
          <slot name="title" />
        </span>
      </div>

      <ul class="AppLayout-Controller">
        <remix-icon @click="closeWindow" name="close" />
        <remix-icon @click="minimizeWindow" name="subtract" />
      </ul>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside">
        <FlatNavBar>
          <template #plugin-nav>
            <slot name="plugin-nav" />
          </template>
        </FlatNavBar>

        <div class="AppLayout-IconFooter" :class="{ 'active': account?.user?.username }">
          <slot name="icon" />
          <div v-if="account?.user?.username" class="AppLayout-Footer">
            <p> {{ account.user.username }} <IdentifiedIcon style="color: var(--el-color-success-dark-2)" /> </p>
            <span> {{ account.user.email }}</span>
          </div>
        </div>
      </div>

      <div class="AppLayout-View fake-background">
        <slot name="view" />
      </div>
    </div>
  </div>
</template>

<script>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import IconButton from '@comp/base/button/IconButton.vue'

export default {
  name: "AppLayoutFlat",
  components: { IconButton, RemixIcon }
}
</script>

<script setup>
import FlatNavBar from "@comp/customize/navbar/FlatNavBar.vue";
import IdentifiedIcon from "@comp/icon/svg/IdentifiedIcon.vue";
import { applicationUpgrade } from "@modules/hooks/applicatoin-hooks";

const account = window.$storage.account

function minimizeWindow() {
  window.$nodeApi.minimize()
}

function closeWindow() {
  window.$nodeApi.close()
}
</script>

<style lang="scss">
.blur {
  .AppLayout-Container {
    backdrop-filter: blur(100px) saturate(180%) brightness(1.2) !important;
  }
}
</style>

<style lang="scss" scoped>
.AppLayout-Container.Flat {
  .AppLayout-View {
    position: relative;
    padding: 5px;

    top: 5px;
    left: 5px;

    flex: none;

    height: calc(100% - var(--ctr-height) - 10px);
    width: calc(100% - var(--nav-width) - 10px);

    --fake-radius: 8px;
    border-radius: 8px;
    border: 1px solid var(--el-border-color-dark);
    box-sizing: border-box;
  }

  .AppLayout-IconFooter {
    &.active {
      transform: translateY(0);
    }
    &:before {
      content: '';
      position: absolute;

      top: -1px;
      left: 5%;

      width: 90%;
      height: 0;

      border-top: 1px solid var(--el-border-color);
    }
    :deep(.AppLayout-Icon) {
      bottom: 0;
    }
    .AppLayout-Footer {
      & > p {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
      }
      & > span {
        margin: 0;
        font-size: 10px;
        font-weight: 400;
      }
      position: absolute;
      display: flex;

      flex-direction: column;
      justify-content: center;

      top: 4px;
      right: 10px;

      width: calc(100% - 70px);
      height: 100%;

      font-size: 12px;
      box-sizing: border-box;
    }
    position: absolute;
    padding: 0;

    left: 0;
    bottom: 20px;

    --default-icon-addon: 5px;

    width: 100%;
    height: 50px;

    transform: translateY(100%);
    transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
  }

  .AppLayout-Aside {
    &:before {
      content: '';
      position: absolute;

      top: 0;
      left: 5%;

      width: 90%;
      height: 0;

      border-top: 1px solid var(--el-border-color);
    }
    position: relative;
    border-right: 1px solid var(--el-border-color);
  }
}

.AppLayout-Container.Flat {

  --ctr-height: 60px;
  --nav-width: 230px;

  .AppLayout-Header {
    padding: 0;
    .AppLayout-Icon {
      & span {
        .has-update &:after {
          content: '';
          position: absolute;

          margin-left: 10px;
          margin-top: 5px;

          width: 8px;
          height: 8px;

          border-radius: 50%;
          background-color: var(--el-color-warning);

          animation: breathing 1.5s ease-in-out infinite;
        }
        .has-update & {
          pointer-events: all;
          cursor: pointer;
          :deep(span) {
            background-color: var(--el-color-warning-light-7) !important;
          }
        }
        .blur & {
          opacity: .75;
        }
        margin-left: 10px;
        padding: 4px 2px;
        font-size: 12px;

        pointer-events: none;
        -webkit-app-region: no-drag;

        border-radius: 8px;
        background-color: var(--el-fill-color);
      }
      :deep(.tag) {
        padding: 4px 6px;
        filter: invert(.1) !important;

        --fake-radius: 8px;
        border-radius: 8px;
      }
      display: flex;
      padding: 0 0 0 1%;

      height: var(--ctr-height);
      width: var(--nav-width);

      align-items: center;
      text-indent: 5px;
      box-sizing: border-box;
      border-right: 1px solid var(--el-border-color);

      img {
        width: 32px;
      }

    }
    justify-content: start;
  }

  .AppLayout-Controller {
    .remix {
      &:hover {
        color: var(--el-fill-color-light);
        background-color: var(--color);
      }
      position: relative;
      display: flex;

      justify-content: center;
      align-items: center;

      width: 50px;
      //height: 100%;

      cursor: pointer;
      font-size: 20px;
      color: var(--el-text-color-primary);

      --fake-radius: 0;
      transition: .25s;
      &:first-child {
        --color: var(--el-color-error);
      }
      &:nth-child(2) {
        --color: var(--el-text-color-primary);
      }
    }
    position: absolute;
    display: flex;

    right: 1%;

    height: 25px;
    width: max-content;

    justify-content: center;
    align-items: center;
    flex-direction: row-reverse;
  }
}
</style>