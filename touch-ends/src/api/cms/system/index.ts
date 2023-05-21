import Router from 'koa-router'
import './model.js'
import { adminRequired } from '../../../middleware/jwt/index.js'
import { Context } from 'koa'
import { LogListValidator } from './validate.js'
import { SystemLog } from './model.js'
import { UserModel } from '../user/model.js'
import Setting from '../../../config/setting.js'
import { Op } from 'sequelize'
import { mountIp, reqCount } from '../../../middleware/network/network.js'

const router = new Router({
    prefix: "/system"
})

router.get('/dashboard', async ctx => {
    ctx.body = {
        visit: reqCount,
        users: (await UserModel.findAndCountAll()).count
    }
})

router.post('/logs', adminRequired, async (ctx: Context) => {
    const v: LogListValidator = await new LogListValidator().validate(ctx);

    const where = {}

    if( v.start ) where['created_at'] = {
        [Op.gte]: [v.start]
    }

    if( v.end ) where['created_at'] = {
        [Op.lte]: [v.end]
    }

    if( v.executor ) where['executor_id'] = v.executor

    ctx.body = await SystemLog.findAndCountAll({
        offset: v.page * Setting.page.size,
        order: [
            [ 'created_at', 'DESC' ]
        ],
        where,
        limit: Setting.page.size,
        include: [ UserModel ]
    })
})

;(() => {

    if( !__development ) return

    router.get('/ip', mountIp, async (ctx: Context) => {
        const { currentSource } = ctx
        ctx.body = {
            req: ctx.request,
            currentSource
        }
    })

})()

export default () => router
