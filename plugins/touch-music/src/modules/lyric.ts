import { SingleSongManager, SongManager } from '@modules/song-manager'
import { axios } from '@modules/axios'
import { readonly } from 'vue'

export class NormalLyric {
  lyric: Map<string | number, string>
  _lyric
  constructor(lyric: string) {
    this._lyric = lyric

    this.lyric = this.analyzeLyric(lyric)
  }

  analyzeLyric(lyric) {
    const lines = lyric.split( '\n' )

    const result = new Map()

    lines.forEach(line => {
      const time = line.match(/(\d{2}):(\d{2})\.(\d{2,3})/)
      if( !time ) return

      const timeSec = +time[1] * 60 + +time[2]

      // result[`${time[1]}:${time[2]}`] = line.replace(/\[(\d{2}):(\d{2})\.(\d{3})\]/, '')
      result.set(timeSec, line.replace(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/, ''))
    })

    return result
  }

}

export class WordLyric {

  _songManager: SongManager

  _lyric: any

  wordLyric: any

  constructor(songManager: SongManager) {
    this._songManager = songManager
  }

  async init() {
    this._lyric = await axios.get('/lyric/new', {
      params: {
        id: this._songManager.songId
      }
    })

    if( !this?._lyric?.yrc ) return
    const { lyric } = this?._lyric?.yrc

    this.wordLyric = lyric
  }

}