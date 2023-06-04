import { axios } from '@modules/axios'
import { reactive, watch } from 'vue'
import { NormalLyric, WordLyric } from '@modules/lyric'
import DayJS from 'dayjs'
import { Howl } from 'howler'

export class SongManager {
    songId: string | string[] | number | number[]
    detail: any
    url: any
    lyric: any
    wordLyric = new WordLyric(this)
    constructor(songId, callback) {

        this.songId = songId instanceof Array ? songId.join() : songId

        ;(async () => {

            const res = await Promise.all([
                this._detail(),
                this._url(),
                this._lyric(),
                this.wordLyric.init()
            ])

            this.detail = res[0]
            this.url = res[1]
            this.lyric = res[2]

            callback?.(this.detail.code === 200 && this.url.code === 200 && this.lyric.code === 200)

        })()

    }

    _lyric() {
        return axios.get('/lyric', {
            params: {
                id: this.songId
            }
        })
    }

    _detail() {
        return axios.get('song/detail', {
            params: {
                ids: this.songId
            }
        })
    }

    _url() {
        return axios.get('/song/url/v1', {
            params: {
                id: this.songId,
                level: "standard"
            }
        })
    }

}

export class SingleSongManager {
    _songManager: SongManager
    detail: any
    url: any
    audio: Howl
    lyric: NormalLyric
    progress = reactive({
        current: 0,
        total: 0,
        now_time: "",
        total_time: "",
        now_lyric: ""
    })
    colors: any
    callback: Function
    onend(callback) {
        this.callback = callback
    }

    // 0->stop 1->play 2->pause
    _flag: number = 0

    constructor(id) {

        this._songManager = new SongManager(id, async (flag) => {
            if ( !flag ) throw new Error("Song init failed!")

            this.detail = {
                privilege: this._songManager.detail.privileges[0],
                song: this._songManager.detail.songs[0]
            }

            this.url = this._songManager.url.data[0]
            this.lyric = new NormalLyric( this._songManager.lyric?.lrc?.lyric)

            this.audio = new Howl({
                src: [this.url.url],
                html5: true,
                format: ['dolby', 'webm', 'mp3'],
            })

            this.audio.once('load', (e) => {

                console.log( e )

                this._flag = 1

                this.progress.total = this.audio.duration()
                this.progress.total_time = DayJS().startOf('day').add(this.progress.total, 'second').format('mm:ss')
                this.progress.now_lyric = this.detail.song.name

                // global.$asyncMainProcessMessage('update-title', `正在播放：${this.detail.song.name} - ${this.detail.song.ar[0].name}`)
                document.title = `正在播放：${this.detail.song.name} - ${this.detail.song.ar[0].name}`

                // watch(() => this.progress.current, (value) => {
                //   console.log( value )
                // })

                this.audio.fade(0, 1, 1000)

                this.audio.play()

                const that = this
                function updateProgress() {
                    if ( that._flag === 0 ) return

                    if( !that.audio ) return

                    if ( that._flag === 1 ) {

                        that.progress.current = that.audio.seek()
                        that.progress.now_time = DayJS().startOf('day').add(that.progress.current, 'second').format('mm:ss:SSS')

                        const _lyric = that.lyric.lyric.get( Math.floor(that.progress.current) )
                        if ( _lyric && that.progress.now_lyric !== _lyric )
                            that.progress.now_lyric = _lyric

                        setTimeout(updateProgress, 10)

                    } else {

                        setTimeout(updateProgress, 1000)

                    }

                }

                updateProgress()

            })

            this.audio.once('end', () => {

                this._flag = 0

                this.callback?.()

            })

            // const colors = await rgbaster( `${this.detail.song?.al.picUrl}?param=32y32`, {
            //     exclude: ['rgb(255,255,255)', 'rgb(0,0,0)'],
            //     paletteSize: 50
            // } )
            //
            // this.colors = [
            //     colors[1], colors[2], colors[3], colors[4], colors[5]
            // ]

        })

    }

    play() {
        if( !this.audio ) return
        if( this.audio.playing() ) return

        this._flag = 1

        this.audio.fade(0, 1, 200)

        this.audio.play()

        window.title = `正在播放：${this.detail.song.name} - ${this.detail.song.ar[0].name}`
    }

    pause() {
        if( !this.audio ) return
        if( !this.audio.playing() ) return

        this._flag = 2

        this.audio.fade(1, 0, 200)

        setTimeout(() => {
            if( this._flag === 2 ) this.audio.pause()
        }, 200)

        window.title = `已停止：${this.detail.song.name} - ${this.detail.song.ar[0].name}`
    }

    changeSeek(value) {
        if( !this.audio ) return

        this.audio.seek(value)
    }

    setVolume(value) {
        if( !this.audio ) return

        this.audio.volume(value)
    }

}