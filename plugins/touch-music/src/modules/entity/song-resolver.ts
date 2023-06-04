import { axios } from "@modules/axios";
import { Howl } from "howler";
import { computed, ComputedRef } from "vue";

export enum SongPlatform {
  NETEASE, QQ, XIA_MI, APPLE_MUSIC, SPOTIFY, KU_GOU, KU_WO, MIGU, JIU_KU, BILIBILI
  , QI_SHUI
}

export class SongArtist {
  name: string
  id: number
  platform: SongPlatform = SongPlatform.NETEASE

  constructor(data: object) {
    this.name = data['name']
    this.id = data['id']
  }
}

export class SongAlbum {
  name: string
  id: number
  picUrl: string
  platform: SongPlatform = SongPlatform.NETEASE

  constructor(data: object) {
    this.name = data['name']
    this.id = data['id']
    this.picUrl = data['picUrl']
  }
}

export class SingleSong {

  name: string
  id: number
  platform: SongPlatform = SongPlatform.NETEASE
  artists: SongArtist[]
  popularity: number
  album: SongAlbum

  _originData: object

  constructor(data: object) {
    this._originData = data

    console.log( this )

    this.name = data['name']
    this.id = data['id']
    this.artists = data['ar']?.map( (artist: object) => new SongArtist(artist) )
    this.popularity = data['pop']
    this.album = new SongAlbum(data['al'])
  }
}

export class PlaySong extends SingleSong {

  size: number
  url: string
  time: number

  sound: Howl

  state: ComputedRef<"unloaded" | "loading" | "loaded">
  duration: ComputedRef<number>

  _data: object

  constructor(data: object, detail: object) {
    super(data);

    this.url = detail[0].url
    this.size = detail[0].size
    this.time = detail[0].time

    this.sound = new Howl({
      src: [ this.url ],
      html5: true
    })

    this.state = computed(() => this.sound.state())
    this.duration = computed(() => this.sound.seek())

    this._data = detail[0]
  }

  play() {
    this.sound.play()
  }

  pause() {
    this.sound.pause()
  }

  volume(volume: number) {
    this.sound.volume(volume)
  }
}