import compressing from 'compressing';
import fs from 'fs';
import path from 'path';
import {promisify} from 'util';
import {Transform} from 'stream';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class CompressLimit {

    /**
     * 0: no limits
     * SI: B
     */
    size: number

    amount: number

    constructor(size = 1024 * 1024 * 100, amount = 100) {
        this.size = size
        this.amount = amount
    }

}

export class TalexCompress {

    sourcePaths: Array<string>
    destPath: string

    destStream: fs.WriteStream
    progressStream: Transform

    totalBytes: number = 0
    limit: CompressLimit = new CompressLimit()

    setLimit(limit: CompressLimit) {
        this.limit = limit
    }

    constructor(sourcePaths: Array<string>, destPath: string, initContent = '') {
        this.sourcePaths = sourcePaths
        this.destPath = destPath

        fs.writeFileSync(destPath, initContent)

        const that = this

        this.destStream = fs.createWriteStream(destPath, { flags: 'a' })
        this.progressStream = new Transform({
            transform(chunk, encoding, callback) {
                this['bytesTransferred'] += chunk.length;

                that.call('progress', this['bytesTransferred'])

                callback(null, chunk)
            },
            flush(callback) {
                that.call('flush')

                callback()
            }
        })

        this.progressStream['bytesTransferred'] = 0;
    }

    _events = {}

    eventName: 'progress' | 'flush' | 'stats' | 'err'

    call(event: typeof this.eventName, ...args) {
        this._events[event]?.forEach(callback => callback(...args))
    }

    on(event: typeof this.eventName, callback: Function) {
        this._events[event] = [...(this._events[event] || []), callback]
    }

    async statsSize() {

        const source = [ ...this.sourcePaths ]
        let amo = 0

        this.call('stats', this.totalBytes = 0)

        while ( source.length ) {

            const srcPath = source.shift()

            const srcStat = await stat(srcPath)
            this.totalBytes = this.totalBytes + srcStat.size

            if ( srcStat.isDirectory() ) {
                const dir = await readdir(srcPath)

                source.push(...dir.map(file => path.join(srcPath, file)))

                continue;

            } else amo += 1

            this.call('stats', { srcPath, srcStat, totalBytes: this.totalBytes })

            if ( this.limit.amount && amo > this.limit.amount ) {
                this.call('err', 'Compress amount limit exceeded')

                return false
            }

            if ( this.limit.size && this.totalBytes > this.limit.size ) {
                this.call('err', 'Compress size limit exceeded')

                return false
            }

        }

        this.call('stats', -1)

        return true
    }

    async compress() {

        if ( !await this.statsSize() ) return

        const compressStream = new compressing.tar.Stream();

        this.sourcePaths.forEach(srcPath => compressStream.addEntry(srcPath))

        compressStream.pipe(this.progressStream).pipe(this.destStream)

    }

}


// export async function asyncCompress(srcPaths: Array<string>, destPath: string, handler: Function) {
//
//     async function compressFile(filePath, fileStat) {
//         const readStream = fs.createReadStream(filePath)
//         console.log( 'compressFile', filePath, fileStat )
//         return new Promise<void>((resolve, reject) => {
//             const compressStream = new compressing.tar.Stream();
//             // const compressFileStream = new compressing.tar.FileStream();
//
//             handler('file', { filePath, fileCount, compFile });
//
//             const writeStream = fs.createWriteStream(destPath, {flags: 'a'});
//
//             pipeline(readStream, compressStream, writeStream, (err) => {
//                 if ( err ) reject(err)
//                 else resolve()
//             })
//             // readStream.pipe(compressStream)
//             //     .on('error', reject)
//             //     .on('end', resolve);
//
//             handler('compress', { filePath, size: fileStat.size });
//
//             // const destPath = //path.join(srcPath, destFile);
//             // compressStream.pipe(writeStream);
//
//             let compressedBytes = 0;
//             let totalBytes = fileStat.size;
//             compressStream.on('data', (data) => {
//                 compressedBytes += data.length;
//                 handler('progress', { filePath, compressedBytes, totalBytes });
//                 // console.log(`已完成 ${compressedBytes}/${totalBytes}`);
//             });
//             compressStream.on('entry', (entry) => {
//                 handler('entry', { filePath, entry });
//                 // console.log(`正在压缩 ${entry.path} (${compressedBytes}/${totalBytes}), 速度 ${entry.speed.toFixed(2)} bytes/s`);
//             });
//             compressStream.on('finish', () => {
//                 handler('finish', { filePath });
//                 resolve();
//             });
//         });
//     }
//
//     async function compress(srcPath) {
//         const srcStat = await stat(srcPath);
//         if (!srcStat.isDirectory()) {
//             await compressFile(srcPath, srcStat);
//         } else {
//             const files = await readdir(srcPath);
//
//             for (const file of files) {
//                 const filePath = path.join(srcPath, file);
//                 const fileStat = await stat(filePath);
//                 if (fileStat.isDirectory()) {
//                     // 目录递归处理
//                     handler('dir', { dirPath: filePath });
//                     await compress(filePath);
//                 } else {
//                     // 压缩文件
//                     await compressFile(filePath, fileStat);
//                 }
//             }
//         }
//
//         // return files.map(async (file) => {
//         //     const filePath = path.join(srcPath, file);
//         //     const fileStat = await stat(filePath);
//         //
//         //     if (fileStat.isDirectory()) {
//         //         // 目录递归处理
//         //         handler('dir', { dirPath: filePath });
//         //         return compress(filePath);
//         //     } else {
//         //         // 压缩文件
//         //         return compressFile(filePath, fileStat);
//         //     }
//         // })
//         // // await Promise.all(tasks);
//     }
//
//     for (const srcPath of srcPaths) {
//         await compress(srcPath);
//     }
//
//     // const allTasks = srcPaths.map((srcPath) => {
//     //     handler('src', { srcPath });
//     //     return compress(srcPath);
//     // })
//     //
//     // handler('all', { srcPaths });
//     //
//     // const res = await Promise.all(allTasks);
//     //
//     // handler('done', { srcPaths });
//
//     // return res
// }