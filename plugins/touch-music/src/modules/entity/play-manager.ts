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
    this.isPause = false

    if (!this.song) {
      const song = this.playList[++this.playIndex]

      const res = await axios.get(`/song/url?id=${song.id}`)

      if (res.code !== 200) {
        console.log(res)
        throw new Error('Failed to get song url!')
      }

      const playSong = new PlaySong(song._originData, res.data)

      console.log(this, playSong)

      this.song = playSong
    }

    this.song.play()
  }

  pause() {
    if (this.isPause)
      return
    this.isPause = true

    this.song.pause()
  }

  addSong(song: SingleSong) {
    this.playList.push(song)
  }

  addSongs(songs: SingleSong[]) {
    this.playList = songs
  }
}

export const player = new PlayManager()
