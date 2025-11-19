<script>
</script>

<script setup>
import MusicWaving from '@comp/icon/MusicWaving.vue'
import Singers from '@comp/music/song/Singers.vue'
import DayJS from 'dayjs'
import { onMounted, ref } from 'vue'

const props = defineProps({
  song: {
    type: Object,
  },
  order: {
    type: Number,
  },
  shrink: {
    type: Boolean,
  },
  active: {
    type: Boolean,
  },
  playing: {
    type: Boolean,
  },
  simple: {
    type: Boolean,
  },
  orderText: {
    type: String,
  },
})

export default {
  name: 'SongItem',
}

const time = ref('00:00')

onMounted(() => {
  time.value = DayJS(props.song.dt).format('mm:ss')
})
</script>

<template>
  <div v-if="song" class="SongItem-Container" :class="{ shrink, active, simple }">
    <div class="SongItem-Avatar">
      <MusicWaving :playing="playing" :active="active">
        <img :src="`${song.al.picUrl}?param=48y48`" :alt="song.name">
      </MusicWaving>
    </div>
    <div class="SongItem-Info">
      <div class="SongItem-Info-Name">
        {{ song.name }}
        <span v-if="song.mv" class="SongItem-Tag" style="--tag-color: #07a3f6dd" v-text="`MV`" />

        <span v-if="song.fee === 1" class="SongItem-Tag" style="--tag-color: var(--el-color-danger-light-3)" v-text="`VIP`" />
        <span v-if="song.hr" class="SongItem-Tag" style="--tag-color: #212121ee" v-text="`Hi-Res`" />
        <span v-else-if="song.sq" class="SongItem-Tag" style="--tag-color: #2c2f2fcc" v-text="`SQ`" />

        <span v-if="song.pop > 80" class="SongItem-Tag" style="--tag-color: #dd001bcc" v-text="`爆`" />
        <span v-else-if="song.pop > 50" class="SongItem-Tag" style="--tag-color: #fa2475cc" v-text="`火`" />

        <span v-if="song.originCoverType === 1" class="SongItem-Tag" style="--tag-color: #59b359" v-text="`原唱`" />
      </div>
      <div class="SongItem-Info-Artist">
        <Singers :singers="song.ar" />
      </div>
    </div>
    <!--    <div v-if="!simple" class="SongItem-Album"> -->
    <!--        {{ song.al.name }} -->
    <!--    </div> -->
    <div class="SongItem-Suffix">
      <span :style="`${order ? '' : 'font-size: 16px'}`" class="SongItem-Time">{{ time }}</span>
      <span v-if="order && order < 10" class="SongItem-Order">NO.{{ order }}</span>
      <span v-else-if="order" class="SongItem-Order">{{ orderText !== undefined ? orderText : '队列' }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SongItem-Container {
  &:hover {
    background-color: var(--el-fill-color);
    .SongItem-Album {
      opacity: .75;
    }
  }
  .SongItem-Avatar {
    img {
      height: 100%;
      border-radius: 4px;
    }
    height: 100%;
  }
  .SongItem-Info {
    .SongItem-Tag {
      position: relative;
      margin-left: -5px;
      display: inline-block;
      padding: 0 4px;

      height: 24px;
      line-height: 24px;

      color: #fff;
      font-size: 14px;

      border-radius: 4px;
      background-color: var(--tag-color, var(--el-border-color));
      border: 1px solid var(--tag-color, var(--el-border-color));
      box-sizing: border-box;
      transform: scale(.7);
    }
    margin-left: 10px;
    display: flex;
    flex-direction: column;

    height: 100%;

    justify-content: space-around;
    .SongItem-Info-Name {
      font-size: 14px;
      font-weight: 600;

      max-width: 50%;

      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
    .SongItem-Info-Artist {
      display: flex;

      align-items: center;

      font-size: 12px;
      opacity: .75;

      max-width: 120px;

      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
  }
  .SongItem-Album {
    margin-left: 20px;

    //max-width: 100px;

    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;

    font-size: 12px;
    opacity: 0;
    transition: .25s;
  }
  .SongItem-Suffix {
    margin-left: auto;
    display: flex;
    flex-direction: column;

    justify-content: space-around;
    .SongItem-Time {
      font-size: 12px;
      opacity: .75;
    }
    .SongItem-Order {
      font-size: 12px;
      opacity: .75;
      text-align: right;
    }
  }
  &.shrink {
    width: calc(100% - 10px);
  }
  &.active {
    border: 2px solid var(--el-color-primary);
    background-color: var(--el-fill-color-dark);
  }
  position: relative;
  display: flex;

  padding: 8px;
  align-items: center;

  height: 72px;
  width: 100%;

  cursor: pointer;
  border-radius: 4px;
  box-sizing: border-box;
  transition: .25s;
}
</style>
