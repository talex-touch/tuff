<script name="AppConfigure" setup lang="ts">
import FlatButton from "@comp/base/button/FlatButton.vue";
import cprocess from "child_process";
import fs from 'fs'
import path from 'path'
import { appAmo } from '~/views/box/search-box'
import { forTouchTip } from '~/modules/mention/dialog-mention'

const props = defineProps<{
  data: any,
}>()

const emits = defineEmits<{
  (e: 'execute', val: any): void
}>()

const info = ref()

watchEffect(() => {
  $ignore: [props.data]

  info.value = null

  !(async () => {
    const res = await fs.statSync(props.data.desc)

    info.value = res
  })()
})

function formatSize(size: number) {
  return (size / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTime(time: number) {
  return new Date(time).toLocaleString()
}

function handleLaunch() {
  // Avoid renderer interrupt

  setTimeout(() => {
    emits('execute', props.data)
  }, 500)
}

function handleOpenExplorer() {
  // Avoid renderer interrupt

  setTimeout(() => {
    cprocess.execSync(`explorer.exe /select,${props.data.desc}`)
  }, 500)
}

function handleDelete() {
  const targetPath = path.join(props.data.desc, '..')

  console.log('targetpath', targetPath)

  fs.readdir(targetPath, (err, files) => {
    if (err) {
      console.log(err)
      return
    }

    let flag = false

    files.forEach((file) => {
      if (flag) return

      if (file.toLowerCase().includes('uninstall')) {
        flag = true

        try {
          cprocess.execSync(path.join(targetPath, file))
        } catch (e) {
          // open this exe
          cprocess.execSync(`explorer.exe /select,${path.join(targetPath, file)}`)
        }
      }
    })

    if (!flag) {
      forTouchTip("Not Found", "Cannot find uninstall program.", [
        { content: "Got it", type: "error", onClick: async () => true }
      ])
    }
  })
}
</script>

<template>
  <div class="AppConfigure">
    <div class="AppConfigure-Head">
      <div class="AppConfigure-Head-Left">
        <img :src="data.icon" alt="Application Logo">
      </div>
      <div class="AppConfigure-Head-Right">
        <div class="AppConfigure-Head-Right-Top">{{ data.name }}</div>
        <div class="AppConfigure-Head-Right-Bottom">{{ data.desc }}</div>
      </div>
    </div>
    <div class="AppConfigure-Content">
      <el-scrollbar>
        <div class="AppConfigure-Content-Inner">
          <t-group-block name="Application action" icon="auction">
            <t-block-slot title="Launch app" icon="external-link">
              <FlatButton @click="handleLaunch">Launch</FlatButton>
            </t-block-slot>
            <t-block-slot title="Open in explorer" icon="folder-2">
              <FlatButton @click="handleOpenExplorer">Open</FlatButton>
            </t-block-slot>
            <t-block-slot icon="delete-bin-2">
              <template #label>
                <h3>Uninstall app <span color-red>(danger)</span></h3>
              </template>
              <FlatButton @click="handleDelete" hover:bg-red>Uninstall</FlatButton>
            </t-block-slot>
            <t-block-switch guidance title="Application Help" description="Find help through search engine."
              icon="search-2" />
          </t-group-block>

          <t-group-block name="Application stats" icon="dashboard-horizontal">
            <t-block-line title="Name">
              <template #description>
                {{ data.names }}
              </template>
            </t-block-line>
            <t-block-line title="Type" :description="data.type"></t-block-line>
            <t-block-line title="Value" :description="data.value"></t-block-line>
            <t-block-line title="Keywords">
              <template #description>
                {{ data.keyWords }}
              </template>
            </t-block-line>
            <t-block-line title="Trigger" :description="appAmo[data.name] || '-'"></t-block-line>
          </t-group-block>

          <t-group-block v-if="info" name="Application specification (External)" icon="apps">
            <t-block-line title="Version">
              <template #description>
                1
              </template>
            </t-block-line>
            <t-block-line title="Size" :description="formatSize(info.size)"></t-block-line>
            <t-block-line title="Dev" :description="info.dev"></t-block-line>
            <t-block-line title="Ino" :description="info.ino"></t-block-line>
            <t-block-line title="Mode" :description="info.mode"></t-block-line>
            <t-block-line title="NLink" :description="info.nlink"></t-block-line>
            <t-block-line title="Uid" :description="info.uid"></t-block-line>
            <t-block-line title="Gid" :description="info.gid"></t-block-line>
            <t-block-line title="RDev" :description="info.rdev"></t-block-line>
            <t-block-line title="BlkSize" :description="info.blksize"></t-block-line>
            <t-block-line title="AtimeMs" :description="formatTime(info.atimeMs)"></t-block-line>
            <t-block-line title="CtimeMs" :description="formatTime(info.ctimeMs)"></t-block-line>
            <t-block-line title="BirthTimeMs" :description="formatTime(info.birthtimeMs)"></t-block-line>
          </t-group-block>
        </div>
      </el-scrollbar>
    </div>
    <div class="AppConfigure-Ends">
      Sure to config and synchronize among devices?
      <FlatButton>
        Save
      </FlatButton>
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
      opacity: .8;
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