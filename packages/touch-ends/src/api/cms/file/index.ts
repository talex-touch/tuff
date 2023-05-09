import Router from 'koa-router'
import './model.js'
import { loginRequired } from '../../../middleware/jwt/index.js'
import koaBody from 'koa-body'
import { Context } from 'koa'
import Setting from '../../../config/setting.js'
import * as path from 'path'
import { FileModel } from './model.js'
import { FileType } from '../../../lib/util/enums.js'
import send from 'koa-send'
import fs from 'fs'
import { createAllDirectorySync, getFileUUIDFromName, isImageFile } from '../../../lib/util/common.js'
import { FileDownloader, ImageDownloader } from './validate.js'
import { ResourceNotFoundError, ResourceRepeatError } from '../../../error/base-error.js'
import chalk from 'chalk'
import setting from '../../../config/setting.js'
import { _signCaptchaVerifiedToken, generateCaptcha, validateCaptcha } from '../../../middleware/captcha/index.js'

const rootPath = path.resolve(__dirname, Setting.dir.static, Setting.file.dir)
const tmpDir = path.resolve(rootPath, 'tmp')

if( !fs.existsSync(rootPath) ) {
    createAllDirectorySync(rootPath)
    createAllDirectorySync(tmpDir)
}

console.log("File", `The file storage root path: ${chalk.bgWhite.black(` ${rootPath} `)} / ${chalk.grey(__dirname)}`)

const router = new Router({
    prefix: "/file"
})

router.get('/captcha/gen', async ctx => {

    ctx['_logClosed'] = true

    const captcha = await generateCaptcha()

    delete captcha.rotate

    ctx.body = captcha

})

router.post('/captcha/valid', validateCaptcha, async ctx => {})

router.get('/image/:uuid', async ctx => {
    const v: ImageDownloader = await new ImageDownloader().validate(ctx)

    const uuid = v.uuid
    const ext = uuid.split(".").at(-1)
    const tUUID = uuid.replace(ext, "")
    const id = tUUID.split("_").at(-1)

    const model = await FileModel.findOne({
        where: {
            id
        }
    })

    if( !model ) throw new ResourceNotFoundError("Unknown image")

    if( tUUID !== model.uuid + "_" + id ) {

        console.log("#UUID this: " + tUUID + " | model: " + model.uuid)

        throw new ResourceNotFoundError("Unknown image uuid")

    }

    if( ext !== model.extension ) {

        console.log("#UUID this: " + tUUID + " | model: " + model.uuid)

        throw new ResourceNotFoundError("Unknown image uuid")

    }

    const abP = model.path //path.resolve(rootPath, model.path)

    console.log("File", "Responding " + chalk.cyan("image") + " file at " + chalk.grey(abP) + " | " + ext)

    ctx.set('content-type', 'image/' + ext)
    // ctx.attachment(abP)

    ctx['_file'] = true

    ctx.body = fs.createReadStream(abP)
})

router.get('/download/:path/:uuid', async ctx => {
    const v: FileDownloader = await new FileDownloader().validate(ctx)

    const id = v.i
    const tPath = v.path
    const tUUID = v.uuid

    const model = await FileModel.findOne({
        where: {
            id
        }
    })

    if( !model ) throw new ResourceNotFoundError("Unknown file")

    const cPath = path.basename(model.path)
    if( tPath + ".tfile" !== cPath ) {

        console.log("#Path this: " + tPath + " | model: " + cPath)

        throw new ResourceNotFoundError("Unknown file path")

    }

    if( tUUID !== model.uuid ) {

        console.log("#UUID this: " + tUUID + " | model: " + model.uuid)

        throw new ResourceNotFoundError("Unknown file uuid")

    }

    const abP = model.path //path.resolve(rootPath, model.path)

    console.log("File", "Responding file at " + chalk.grey(abP))

    ctx.attachment(abP)

    ctx['_file'] = true

    ctx.body = fs.createReadStream(abP)
})

router.post('/upload', loginRequired, async (ctx: Context) => {
    const { currentUser } = ctx
    const { file } = ctx.request.files

    // console.dir(ctx.request.files)
    // console.dir(file)

    const res = file instanceof Array ?
        await (async (array) => {
            const results = []
            for ( const value of array ) {
                results.push(await uploadFile(currentUser.id, value))
            }
            console.log("UploadArray", results)
            return results
        })(file as Array<any>) : [ await uploadFile(currentUser.id, file) ]

    ctx.body = {
        paths: res
    }

})

async function uploadFile(user: number, file): Promise<string> {

    // console.dir(file)

    const fileName: string = file.originalFilename
    const fileUUID = getFileUUIDFromName(file.newFilename)
    const filePath = file.filepath //path.resolve(rootPath, Base64Encode(file.filepath))
    const ext = fileName.split('.').at(-1)

    const isImage = await isImageFile(filePath)

    const date = new Date()
    const storagePath = path.resolve(rootPath, `${date.getFullYear()}-${date.getMonth()}`, `${date.getDate()}`)

    createAllDirectorySync(storagePath)

    // console.dir(file)

    const storageFilePath = path.resolve(storagePath, file.newFilename + (isImage ? '.' + ext : '.tfile'))
    fs.renameSync(filePath, storageFilePath)

    // const target = fs.createWriteStream(filePath);

    const model = await FileModel.create({
        type: FileType.LOCAL,
        path: storageFilePath,
        name: fileName,
        uuid: fileUUID,
        extension: ext,
        size: file.size,
        hash: file.hash,
        uploader_id: user
    })

    // target.write(file.data)

    return `${isImage ? `/file/image/${fileUUID}_${model.id}.${ext}` : `/file/download/${file.newFilename}/${fileUUID}?i=${model.id}`}`

}

export default ({ app }) => {

    app
        .use(koaBody({
            formLimit: Setting.file.singleLimit,
            multipart: true,
            formidable: {
                uploadDir: tmpDir,
                // keepExtensions: fal,
                hashAlgorithm: "sha1"
            }
        }))
        .use(router.routes()).use(router.allowedMethods())


}
