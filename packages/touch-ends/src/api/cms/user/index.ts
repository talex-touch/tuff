import Router from 'koa-router'
import './model.js'
import {
    ChangePasswordValidator,
    GetUserOptionValidator,
    HasUserValidator,
    LoginValidator,
    RegisterCodeValidator,
    RegisterVerifyValidator,
    SearchUserValidator,
    UpdateInfoValidator,
    UpdateThemeOptionValidator,
    UserAvatarGetValidator, UserMsgGetValidator
} from './validate.js'
import { LoginHistory, UserIdentity, UserModel, UserMsgModel, UserOptionModel } from './model.js'
import { IdentityType, MessageStatus, MessageType } from '../../../lib/util/enums.js'
import { Context } from 'koa'
import { getToken, loginRequired, refreshToken2AccessToken } from '../../../middleware/jwt/index.js'
import { mountIp } from '../../../middleware/network/network.js'
import Setting from '../../../config/setting.js'
import { defaultRole, getUserEller } from '../../repository.js'
import { captchaRequired } from '../../../middleware/captcha/index.js'
import { sendTemplateTo } from '../../../extension/email/index.js'
import { ResourceNotFoundError } from '../../../error/base-error.js'
import { hexPassword } from '../../../lib/util/common.js'
import { randomInt } from 'crypto'
import jwt from 'jsonwebtoken'
import { UserRole } from '../eller/model.js'
import { Op } from 'sequelize'

const router = new Router({
    prefix: "/user"
})

router.post('/register/email', async ctx => {
    const v: RegisterCodeValidator = await new RegisterCodeValidator().validate(ctx)

    const number = randomInt(100000, 999999)
    const hex =

    jwt.sign({
            email: v.email,
            user: v.username,
            pass: v.password,
            type: "email_code"
        },
        Setting.token.secret + "GD4F65H45D4H5NGF4GD2_TOKEN_EMAIL_TALEX_" + number,
        {
            algorithm: 'HS256',
            expiresIn: 60 * 12 // write with 10 min
        }
    )

    await sendTemplateTo(v.email, "[TalexWiki] 验证码", "Code.html", (str: string) => {
        return str.replace("{{name}}", v.username).replace("{{code}}", String(number))
    })

    ctx.body = hex
})

router.post('/register/verify', captchaRequired, mountIp, async (ctx: Context) => {
    const v: RegisterVerifyValidator = await new RegisterVerifyValidator().validate(ctx)

    const data = jwt.verify(v.hex, Setting.token.secret + "GD4F65H45D4H5NGF4GD2_TOKEN_EMAIL_TALEX" + v.code)

    const user = await UserModel.create({ username: data.user, email: data.email })

    await UserRole.create({
        user_id: user.id,
        role_id: defaultRole.id
    })

    const { currentSource } = ctx

    const userIdentify: UserIdentity = await UserIdentity.create({
        user_id: user.id,
        identity_type: IdentityType.PASSWORD,
        identifier: data.user,
        credential: hexPassword(data.pass)
    })

    await UserIdentity.create({
        user_id: user.id,
        identity_type: IdentityType.EMAIL_PASSWORD,
        identifier: data.email,
        credential: hexPassword(data.pass)
    })

    if( user.roles ) user.roles.push(defaultRole)
    else user.roles = [ defaultRole ]

    // await eller.addRoleForUser(String(rootUser.id), "r:root")

    // create login history
    await LoginHistory.create({
        user_id: user.id,
        identity_type: IdentityType.PASSWORD,
        locale: currentSource.locale.pos,
        device: ctx.request.headers['user-agent'],
        ip: currentSource.ip
    })

    console.log("Register", "New user created: " + JSON.stringify(user))

    await sendTemplateTo(data.email, "[TalexWiki] 恭喜您，注册成功！", "SuccessRegister.html", (str: string) => {
        return str.replace("{{name}}", data.user).replace("{{email}}", data.email)
    })

    ctx.body = {
        user: {
            ...user.toJSON()
        },
        eller: await getUserEller(user.id),
        token: getToken(user)
    }
    // ctx.body = user
})

router.get('/has_user/:user', async ctx => {
    const v: HasUserValidator = await new HasUserValidator().validate(ctx)

    const identity = await UserIdentity.findOne({
        where: {
            identifier: v.user
        }
    })

    if( !identity ) throw new ResourceNotFoundError("unknown identifier of: " + v.user)

    ctx.body = {
        user_id: identity.user_id,
        identity_type: identity.identity_type,
        identifier: identity.identifier
    }
})

router.post('/login', captchaRequired, mountIp, async (ctx: Context) => {
    const v: LoginValidator = await new LoginValidator().validate(ctx)

    const user: UserModel = await UserIdentity.verify(v.username, v.password)

    const { currentSource } = ctx

    // console.dir(currentSource)

    // create login history
    await LoginHistory.create({
        user_id: user.id,
        identity_type: IdentityType.PASSWORD,
        locale: currentSource.locale.pos,
        device: ctx.request.headers['user-agent'],
        ip: currentSource.ip
    })

    console.log("Login", "Login success: " + user.username)

    ctx.body = {
        user: {
            ...user.toJSON()
        },
        eller: await getUserEller(user.id),
        token: getToken(user)
    }

})

router.get('/eller', loginRequired, async (ctx: Context) => {
    const { id } = ctx.currentUser

    ctx.body = await getUserEller(id)
})

router.post('/refresh_token', async ctx => {
    const token = ctx.request.body.refresh_token

    ctx.body = {
        access_token: await refreshToken2AccessToken(token)
    }

})

router.get('/login_histories', loginRequired, async (ctx: Context) => {
    const { id } = ctx.currentUser

    ctx.body = await LoginHistory.findAndCountAll({
        order: [
            [ 'updated_at', 'DESC' ]
        ],
        where: {
            user_id: id
        },
        limit: Setting.page.size
    })
})

router.post('/change_password', loginRequired, async (ctx: Context) => {
    const v: ChangePasswordValidator = await new ChangePasswordValidator().validate(ctx)
    const { id } = ctx.currentUser

    ctx.body = await UserIdentity.changePassword(id, v.original_password, v.changed_password)

})

router.get('/options/:key', loginRequired, async (ctx: Context) => {
    const v: GetUserOptionValidator = await new GetUserOptionValidator().validate(ctx)
    const { id } = ctx.currentUser

    ctx.body = await UserOptionModel.findOne({
        where: {
            user_id: id,
            key: v.key
        }
    })
})

router.put('/options/theme', loginRequired, async (ctx: Context) => {
    const v: UpdateThemeOptionValidator = await new UpdateThemeOptionValidator().validate(ctx)
    const { id } = ctx.currentUser

    let model = await UserOptionModel.findOne({
        where: {
            user_id: id,
            key: 'theme'
        }
    })

    if( !model ) {

        model = await UserOptionModel.create({
            user_id: id,
            key: 'theme',
            value: JSON.stringify(v)
        })

    } else {

        model.value = JSON.stringify(v)

        await model.save()

    }

    ctx.body = model
})

router.post('/search', loginRequired, async (ctx: Context) => {
    const v: SearchUserValidator = await new SearchUserValidator().validate(ctx)

    // const { id } = ctx.currentUser

    // match username/email
    ctx.body = await UserModel.findAll({
        where: {
            [Op.or]: [
                {
                    username: {
                        [Op.like]: `%${v.keyword}%`
                    }
                },
                {
                    email: {
                        [Op.like]: `%${v.keyword}%`
                    }
                }
            ]
        },
        limit: Setting.page.size
    })
})

router.post('/update_info', loginRequired, async (ctx: Context) => {
    const v: UpdateInfoValidator = await new UpdateInfoValidator().validate(ctx)
    const { id } = ctx.currentUser

    const model = await UserModel.findOne({
        where: { id }
    })

    model.avatar = v.cover

    await model.save()

    ctx.body = "success"
})

router.get('/avatar/:id',async (ctx: Context) => {
    const v: UserAvatarGetValidator = await new UserAvatarGetValidator().validate(ctx)

   const model = await UserModel.findOne({
      where: { id: v.id }
   })

    if( !model ) {

        throw new ResourceNotFoundError('unknown user: ' + v.id)

    }

    // console.log("UserAvatar", "For user: " + JSON.stringify(model))

    if( !model.avatar ) {

        throw new ResourceNotFoundError('user do not have avatar')

    }

    ctx.status = 302
    ctx.redirect(model.avatar)
})

router.post('/msg', loginRequired, async (ctx: Context) => {
    const v = await new UserMsgGetValidator().validate(ctx)
    const { id } = ctx.currentUser

    const searchQuery = {
        user_id: id,
        status: MessageStatus.UNREAD
    }

    if ( v.allowRead ) {

        delete searchQuery.status

    }

    if ( !v.page ) v.page = 1

    const data = await UserMsgModel.findAndCountAll({
        where: searchQuery,
        order: [
            [ 'created_at', 'DESC' ]
        ],
        include: [
            {
                model: UserModel,
                as: 'user',
            },
            {
                model: UserModel,
                as: 'sender',
            }
        ],
        limit: Setting.page.size,
        offset: (v.page - 1) * Setting.page.size
    })

    // 添加默认消息
    if ( data.count < 1 ) {

        const res = await UserMsgModel.create({
            user_id: id,
            type: MessageType.TEXT,
            value: '您好，欢迎使用 TalexWiki。这是一条默认消息！',
            sender_id: 1,
            extra_msg: JSON.stringify({
                type: 'system'
            })
        })

        data.count++
        data.rows = [ res ]

    }

    ctx.body = data

})

export default () => router
