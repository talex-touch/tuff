import type { SingleSong } from '@modules/entity/song-resolver'
import { axios } from '@modules/axios'
import { PlaySong } from '@modules/entity/song-resolver'
import { reactive } from 'vue'

export const enum PlayType {
  SINGLE = 1,
  LIST = 2,
  CYCLE_LIST,
  RANDOM,
}

export class PlayManager {
  /**
   * The song is playing
   */
  song: PlaySong | null = null

  /**
   * The play list
   */
  playList = reactive<Array<SingleSong>>([])
  playIndex: number = -1

  /**
   * The play status
   */
  isPause: boolean = true

  playType: PlayType = PlayType.SINGLE
  volume = 75

  constructor() {

  }

  async play() {
    if (!this.isPause)
      return
    if (!this.song) {
      const nextIndex = this.playIndex + 1
      const song = nextIndex >= 0 && nextIndex < this.playList.length
        ? this.playList[nextIndex]
        : undefined
      if (!song) {
        this.isPause = true
        return
      }

      this.isPause = false
      try {
        const res = await axios.get(`/song/url?id=${song.id}`)

        if (!res || res.code !== 200 || !Array.isArray(res.data) || !res.data[0]?.url) {
          throw new Error('Failed to get song url!')
        }

        const playSong = new PlaySong(song._originData, res.data)
        this.playIndex = nextIndex
        this.song = playSong
      }
      catch (error) {
        this.isPause = true
        throw error
      }
    }
    else {
      this.isPause = false
    }

    this.song.play()
  }

  pause() {
    if (this.isPause)
      return
    this.isPause = true

    this.song?.pause()
  }

  addSong(song: SingleSong) {
    this.playList.push(song)
  }

  addSongs(songs: SingleSong[]) {
    this.song?.pause()
    this.song = null
    this.isPause = true
    this.playIndex = -1
    this.playList.splice(0, this.playList.length, ...songs)
  }
}

export const player = new PlayManager()
