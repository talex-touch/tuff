/* eslint-disable no-console */
import fs from 'node:fs'
import { Transform } from 'node:stream'
import path from 'pathe'
import compressing from 'compressing'

export class CompressLimit {
  /**
     * 0: no limits
     * SI: B
     */
  size: number

  amount: number

  constructor(size = 1024 * 1024 * 1024, amount = 100) {
    this.size = size
    this.amount = amount
  }
}

export class TalexCompress {
  sourcePaths: Array<string>
  destPath: string

  destStream: fs.WriteStream
  progressStream: Transform

  totalBytes = 0
  totalFiles = 0
  limit: CompressLimit = new CompressLimit()

  setLimit(limit: CompressLimit) {
    this.limit = limit
  }

  constructor(sourcePaths: Array<string>, destPath: string, initContent = '') {
    this.sourcePaths = sourcePaths
    this.destPath = destPath

    fs.writeFileSync(destPath, initContent)

    const that = () => this
    let bytesTransferred = 0

    this.destStream = fs.createWriteStream(destPath, { flags: 'a' })
    this.progressStream = new Transform({
      transform(chunk, encoding, callback) {
        bytesTransferred += chunk.length

        that().call('progress', bytesTransferred)

        callback(null, chunk)
      },
      flush(callback) {
        that().call('flush')

        callback()
      },
    })

    bytesTransferred = 0
  }

  _events: Record<'progress' | 'flush' | 'stats' | 'err', Array<Function>> = {
    progress: [],
    flush: [],
    stats: [],
    err: [],
  }

  eventName: 'progress' | 'flush' | 'stats' | 'err' = 'progress'

  call(event: typeof this.eventName, ...args: any[]) {
    this._events[event]?.forEach(callback => callback(...args))
  }

  on(event: typeof this.eventName, callback: Function) {
    this._events[event] = [...(this._events[event] || []), callback]
  }

  statsSize() {
    const source = [...this.sourcePaths]
    let amo = 0

    this.call('stats', this.totalBytes = 0)

    this.totalFiles = source.length
    this.call('stats', { type: 'start', totalFiles: this.totalFiles })

    while (source.length) {
      const srcPath: string = source.shift()!

      const srcStat = fs.statSync(srcPath)
      this.totalBytes = this.totalBytes + srcStat.size

      if (srcStat.isDirectory()) {
        const dir = fs.readdirSync(srcPath)

        source.push(...dir.map(file => path.join(srcPath, file)))

        continue
      }
      else {
        amo += 1
      }

      this.call('stats', { type: 'progress', amo, t: source.length, srcPath, srcStat, totalBytes: this.totalBytes })

      if (this.limit.amount && amo > this.limit.amount) {
        this.call('err', 'Compress amount limit exceeded')

        return false
      }

      if (this.limit.size && this.totalBytes > this.limit.size) {
        this.call('err', 'Compress size limit exceeded')

        return false
      }
    }

    this.call('stats', -1)
    // console.log(`[TalexTouch] Stats done! Total bytes: ${this.totalBytes}`)
    return true
  }

  compress() {
    if (!this.statsSize())
      return

    const compressStream = new compressing.tar.Stream()

    this.sourcePaths.forEach((srcPath) => {
      compressStream.addEntry(srcPath, { ignoreBase: true })
    })

    return new Promise<void>((resolve, reject) => {
      compressStream.pipe(this.progressStream).pipe(this.destStream)

      this.destStream.on('finish', () => {
        resolve()
      })

      this.destStream.on('error', (err) => {
        this.call('err', err)

        console.log('[TalexTouch] An fatal error occurred while compressing plugin files.')
        console.error(err)
        reject(err)
      })
    })
  }
}
