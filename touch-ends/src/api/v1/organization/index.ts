import Router from 'koa-router'
import * as Model from './model.js'
import * as Validator from './validate.js'
import { loginRequired } from '../../../middleware/jwt/index.js'
import { Context } from 'koa'
import { ResourceNotFoundError, ResourceProtectedError, ResourceRepeatError } from '../../../error/base-error.js'
import {
    InviteActionType,
    MessageStatus,
    MessageType,
    OrgActionType,
    OrgMemberStatus
} from '../../../lib/util/enums.js'
import { UserModel, UserMsgModel } from '../../cms/user/model.js'
import { OrgInviteActionValidator } from './validate.js'

const router = new Router({
    prefix: "/org"
})

router.get("/list", async (ctx: Context) => {

    ctx.body = await Model.OrganizationModel.findAll({
        include: [ Model.OrgMemberModel ]
    })

})

router.get("/info/:id", loginRequired, async (ctx: Context) => {
    const v = await new Validator.OrganizationInfoValidator().validate(ctx)

    ctx.body = await Model.OrganizationModel.findOne({
        where: {
            id: v.id
        },
        include: [
            {
                model: Model.OrgMemberModel,
                include: [ UserModel ]
            },
            {
                model: UserModel
            }
        ]
    })
})

router.post('/create', loginRequired, async (ctx: Context) => {
    const v = await new Validator.OrganizationCreateValidator().validate(ctx)
    const { currentUser } = ctx

    const number = await Model.OrganizationModel.getUserOrgAccounts(currentUser.id)

    if ( number.count > 1 ) {
        throw new ResourceRepeatError("您已经创建了一个组织")
    }

    ctx.body = await Model.OrganizationModel.create({
        name: v.name,
        avatar: v.cover,
        summary: v.summary,
        owner_id: currentUser.id
    })
})

router.post('/invite', loginRequired, async (ctx: Context) => {
    const v = await new Validator.OrgInviteActionValidator().validate(ctx)

    const { currentUser } = ctx

    const msg = await UserMsgModel.findOne({
        where: {
            id: v.msg_id,
            user_id: currentUser.id
        }
    })

    if ( !msg ) {
        throw new ResourceNotFoundError("消息不存在")
    }

    if ( new Date().getTime() - msg.get('updatedAt') > 1000 * 60 * 60 * 24 * 15 ) {
        throw new ResourceProtectedError("消息已过期")
    }

    const org = await Model.OrganizationModel.findOne({
        where: {
            id: v.id
        },
        include: [ Model.OrgMemberModel, UserModel ]
    })

    if ( !org ) {
        throw new ResourceNotFoundError("组织不存在")
    }

    if ( v.action === InviteActionType.IGNORE ) {
        ctx.body = await msg.update({
          status: MessageStatus.READ
        })
    } else if ( v.action === InviteActionType.ACCEPT ) {
        const member = await Model.OrgMemberModel.findOne({
            where: {
                org_id: v.id,
                member_id: currentUser.id
            }
        })

        if ( member ) {
            throw new ResourceRepeatError("您已经是该组织成员")
        }

        ctx.body = await member.update({
            status: OrgMemberStatus.NORMAL
        })

        await msg.update({
            status: MessageStatus.READ
        })

        await UserMsgModel.create({
            user_id: org.owner_id,
            type: MessageType.TEXT,
            value: `用户 ${currentUser.username} 接受了您的组织邀请`,
            extra_msg: JSON.stringify({
              type: "system"
            })
        })
    } else if ( v.action === InviteActionType.REJECT ) {
        ctx.body = await msg.update({
            status: MessageStatus.READ
        })

        await UserMsgModel.create({
            user_id: org.owner_id,
            type: MessageType.TEXT,
            value: `用户 ${currentUser.username} 拒绝了您的组织邀请`,
            extra_msg: JSON.stringify({
                type: "system"
            })
        })
    }
})

router.post('/invite/:id', loginRequired, async (ctx: Context) => {
    const v = await new Validator.OrgInviteUserValidator().validate(ctx)

    const { currentUser } = ctx

    if ( v.user_id === currentUser.id ) {
        throw new ResourceProtectedError("不能邀请自己")
    }

    const org = await Model.OrganizationModel.findOne({
        where: {
            id: v.id
        },
        include: [ Model.OrgMemberModel, UserModel ]
    })

    if ( !org ) {
        throw new ResourceNotFoundError("组织不存在")
    }

    if ( org.owner_id !== currentUser.id ) {
        throw new ResourceProtectedError("您没有权限邀请用户")
    }

    // 不可重复邀请
    const isRepeat = org.members.some((member) => member.status === OrgMemberStatus.WAITING_ACCEPTING && member.member_id === v.user_id)

    if ( isRepeat ) {
        throw new ResourceRepeatError("该用户已经被邀请")
    }

    // make sure target user is valid
    const user = await UserModel.findOne({
        where: {
            id: v.user_id
        }
    })

    if ( !user ) {
        throw new ResourceNotFoundError("用户不存在")
    }

    const member = await Model.OrgMemberModel.findOne({
        where: {
            org_id: v.id,
            member_id: v.user_id
        }
    })

    if ( member ) {
        throw new ResourceRepeatError("用户已经是组织成员")
    }

    // send invite message
    await UserMsgModel.create({
        user_id: v.user_id,
        type: MessageType.APPLICATION,
        value: `先生，现诚邀请您加入组织 ${org.name}`,
        sender_id: currentUser.id,
        extra_msg: JSON.stringify({
            type: 'organization',
            sub_type: 'invitation',
            org
        })
    })

    ctx.body = await Model.OrgLog.create({
        org_id: v.id,
        member_id: v.user_id,
        action: OrgActionType.INVITATION,
        content: currentUser.id
    })

    ctx.body = await Model.OrgMemberModel.create({
        org_id: v.id,
        member_id: v.user_id,
        status: OrgMemberStatus.WAITING_ACCEPTING
    })

})

router.post('/update', loginRequired, async (ctx: Context) => {
    const v = await new Validator.UpdateInfoValidator().validate(ctx)
    const { currentUser } = ctx

    const org = await Model.OrganizationModel.findOne({
        where: {
            id: v.id,
            // owner_id: currentUser.id
        }
    })

    if ( !org ) {
        throw new ResourceNotFoundError("您还没有创建组织")
    }

    if ( org.owner_id !== currentUser.id ) {
        throw new ResourceProtectedError("您没有权限修改该组织信息")
    }

    ctx.body = await org.update({
        name: v.name,
        avatar: v.cover,
        summary: v.summary
    })
})

export default () => router
