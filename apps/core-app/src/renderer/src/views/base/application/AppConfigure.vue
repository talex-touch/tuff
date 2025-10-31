<script name="AppConfigure" setup lang="ts">
import { useI18n } from 'vue-i18n'
import { touchChannel } from '~/modules/channel/channel-core'
import FlatButton from '@comp/base/button/FlatButton.vue'
// import cprocess from "child_process";
// import fs from 'fs'
// import path from 'path'
// import { forTouchTip } from '~/modules/mention/dialog-mention'

const { t } = useI18n()

const props = defineProps<{
  data: any
}>()

const emits = defineEmits<{
  (e: 'execute', val: any): void
}>()

const info = ref()

watchEffect(() => {
  // $ignore: [props.data]

  info.value = null

  // setTimeout(async() => {
  //   const res = await fs.statSync(props.data.desc)

  //   info.value = res
  // })
})

function formatSize(size: number): string {
  return (size / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString()
}

function handleLaunch(): void {
  // Avoid renderer interrupt

  setTimeout(() => {
    emits('execute', props.data)
  }, 500)
}

function handleOpenExplorer(): void {
  // Avoid renderer interrupt

  setTimeout(() => {
    // cprocess.execSync(`explorer.exe /select,${props.data.desc}`)
  }, 500)
}

function handleDelete(): void {
  // const targetPath = path.join(props.data.desc, '..')
  // console.log('targetpath', targetPath)
  // fs.readdir(targetPath, (err, files) => {
  //   if (err) {
  //     console.log(err)
  //     return
  //   }
  //   let flag = false
  //   files.forEach((file) => {
  //     if (flag) return
  //     if (file.toLowerCase().includes('uninstall')) {
  //       flag = true
  //       try {
  //         cprocess.execSync(path.join(targetPath, file))
  //       } catch (e) {
  //         // open this exe
  //         cprocess.execSync(`explorer.exe /select,${path.join(targetPath, file)}`)
  //       }
  //     }
  //   })
  //   if (!flag) {
  //     forTouchTip("Not Found", "Cannot find uninstall program.", [
  //       { content: "Got it", type: "error", onClick: async () => true }
  //     ])
  //   }
  // })
}

function handleHelp(): void {
  // open google and search
  const url = `https://www.google.com/search?q=${props.data.name}`

  touchChannel.sendSync('open-external', { url })
}
</script>

<template>
  <div class="AppConfigure">
    <div class="AppConfigure-Head">
      <div class="AppConfigure-Head-Left">
        <img :src="data.icon" alt="Application Logo" />
      </div>
      <div class="AppConfigure-Head-Right">
        <div class="AppConfigure-Head-Right-Top">{{ data.name }}</div>
        <div class="AppConfigure-Head-Right-Bottom">{{ data.desc }}</div>
      </div>
    </div>
    <div class="AppConfigure-Content">
      <el-scrollbar>
        <div class="AppConfigure-Content-Inner">
          <t-group-block :name="t('appConfigure.action')" icon="auction">
            <t-block-slot :title="t('appConfigure.launch')" icon="external-link">
              <FlatButton @click="handleLaunch">{{ t('appConfigure.launchBtn') }}</FlatButton>
            </t-block-slot>
            <t-block-slot :title="t('appConfigure.openInExplorer')" icon="folder-2">
              <FlatButton @click="handleOpenExplorer">{{ t('appConfigure.openBtn') }}</FlatButton>
            </t-block-slot>
            <t-block-slot icon="delete-bin-2">
              <template #label>
                <h3>
                  {{ t('appConfigure.uninstall') }}
                  <span color-red>{{ t('appConfigure.danger') }}</span>
                </h3>
              </template>
              <FlatButton hover:bg-red @click="handleDelete">{{
                t('appConfigure.uninstallBtn')
              }}</FlatButton>
            </t-block-slot>
            <t-block-switch
              guidance
              :title="t('appConfigure.help')"
              :description="t('appConfigure.helpDesc')"
              icon="search-2"
              @click="handleHelp"
            />
          </t-group-block>

          <t-group-block :name="t('appConfigure.stats')" icon="dashboard-horizontal">
            <t-block-line :title="t('appConfigure.name')">
              <template #description>
                {{ data.names }}
              </template>
            </t-block-line>
            <t-block-line :title="t('appConfigure.type')" :description="data.type"></t-block-line>
            <t-block-line :title="t('appConfigure.value')" :description="data.value"></t-block-line>
            <t-block-line :title="t('appConfigure.keywords')">
              <template #description>
                {{ data.keyWords }}
              </template>
            </t-block-line>
          </t-group-block>

          <t-group-block v-if="info" :name="t('appConfigure.spec')" icon="apps">
            <t-block-line :title="t('appConfigure.version')">
              <template #description> 1 </template>
            </t-block-line>
            <t-block-line
              :title="t('appConfigure.size')"
              :description="formatSize(info.size)"
            ></t-block-line>
            <t-block-line :title="t('appConfigure.dev')" :description="info.dev"></t-block-line>
            <t-block-line :title="t('appConfigure.ino')" :description="info.ino"></t-block-line>
            <t-block-line :title="t('appConfigure.mode')" :description="info.mode"></t-block-line>
            <t-block-line :title="t('appConfigure.nlink')" :description="info.nlink"></t-block-line>
            <t-block-line :title="t('appConfigure.uid')" :description="info.uid"></t-block-line>
            <t-block-line :title="t('appConfigure.gid')" :description="info.gid"></t-block-line>
            <t-block-line :title="t('appConfigure.rdev')" :description="info.rdev"></t-block-line>
            <t-block-line
              :title="t('appConfigure.blksize')"
              :description="info.blksize"
            ></t-block-line>
            <t-block-line
              :title="t('appConfigure.atimeMs')"
              :description="formatTime(info.atimeMs)"
            ></t-block-line>
            <t-block-line
              :title="t('appConfigure.ctimeMs')"
              :description="formatTime(info.ctimeMs)"
            ></t-block-line>
            <t-block-line
              :title="t('appConfigure.birthTimeMs')"
              :description="formatTime(info.birthtimeMs)"
            ></t-block-line>
          </t-group-block>
        </div>
      </el-scrollbar>
    </div>
    <div class="AppConfigure-Ends">
      {{ t('appConfigure.confirm') }}
      <FlatButton> {{ t('appConfigure.save') }} </FlatButton>
    </div>
  </div>
</template>

<style lang="scss">
.AppConfigure-Head {
  position: relative;
  padding: 1rem;
  display: flex;

  width: 100%;
  height: 48px;

  gap: 1rem;

  border-bottom: 1px solid var(--el-border-color);

  &-Left {
    position: relative;
    display: flex;

    align-items: center;
    justify-content: center;

    height: 100%;
  }

  &-Right {
    &-Top {
      font-weight: 600;
    }

    &-Bottom {
      opacity: 0.8;
      font-size: 0.8rem;
    }

    position: relative;
    display: flex;
    flex-direction: column;

    justify-content: center;

    height: 100%;
  }
}

.AppConfigure {
  &-Content {
    &-Inner {
      padding: 0 1rem;
    }

    position: relative;
    padding: 1rem 0;

    width: 100%;
    height: calc(100% - 48px - 64px - 1rem);

    box-sizing: border-box;
  }

  &-Ends {
    position: sticky;
    padding: 0 1rem;
    display: flex;

    align-items: center;
    justify-content: space-between;

    bottom: 0;

    width: 100%;
    height: 64px;

    box-sizing: border-box;
    border-top: 1px solid var(--el-border-color);
  }

  position: relative;
  flex: 1;

  width: 100%;
  height: 100%;
}
</style>
