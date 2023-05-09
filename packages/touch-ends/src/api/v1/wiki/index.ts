import Router from 'koa-router'
import './model.js'
import { adminRequired, loginRequired } from '../../../middleware/jwt/index.js'
import { Context } from 'koa'
import {
    ChapterCreateValidator, ChapterTreeValidator,
    ChapterUpdateValidator,
    DocumentCreateValidator,
    DocumentUpdateValidator,
    WikiCreateValidator,
    WikiListPageValidator,
    WikiModifyValidator,
    WikiViewValidator
} from './validate.js'
import Setting from '../../../config/setting.js'
import { ChapterModel, DocModel, WikiMember, WikiModel } from './model.js'
import { WikiMemberPermission, WikiPermission, WikiType } from '../../../lib/util/enums.js'
import { AuthFailedError } from '../../../error/user-error.js'
import { ResourceNotFoundError } from '../../../error/base-error.js'
import { UserModel } from '../../cms/user/model.js'
import { Op } from 'sequelize'

const router = new Router({
    prefix: "/wiki"
})

// TODO 获取维基文档需要权限
router.get('/doc/list/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const wikiID = v.id

    ctx.body = await DocModel.findAll({
        where: {
            wiki_id: wikiID
        }
    })
})
router.get('/doc/list_left/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const wikiID = v.id

    ctx.body = await DocModel.findAll({
        where: {
            wiki_id: wikiID,
            chapter_id: {
                [Op.is]: null,
            }
        }
    })
})
router.post('/doc/create', loginRequired, async (ctx: Context) => {
    const v: DocumentCreateValidator = await new DocumentCreateValidator().validate(ctx)

    const { currentUser } = ctx

    const wiki = await WikiModel.findOne({
        where: {
            id: v.wiki
        },
        include: [ WikiMember, ChapterModel ]
    })

    const memberLevel = wiki.memberLevel(currentUser.id)
    if( memberLevel === WikiMemberPermission.NONE ) {

        // check if user have admin permission
        await adminRequired(ctx, async() => {})

        // throw new AuthFailedError("access denied")

    }

    // TODO DOCUMENT CREATE LOG

    ctx.body = await DocModel.create({
        wiki_id: v.wiki,
        chapter_id: v.chapter,
        priority: 0,
        title: v.title,
        content: v.content
    })
})
router.post('/doc/modify/:id', loginRequired, async (ctx: Context) => {
    const v: DocumentUpdateValidator = await new DocumentUpdateValidator().validate(ctx)

    const doc = await DocModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !doc || doc.wiki_id !== v.wiki ) throw new ResourceNotFoundError('unknown document')

    const { currentUser } = ctx

    const wiki = await WikiModel.findOne({
        where: {
            id: v.wiki
        },
        include: [ WikiMember, ChapterModel ]
    })

    const memberLevel = wiki.memberLevel(currentUser.id)
    if( memberLevel === WikiMemberPermission.NONE ) {

        // check if user have admin permission
        await adminRequired(ctx, async() => {})

        // throw new AuthFailedError("access denied")

    }

    // TODO DOCUMENT UPDATE LOG

    await doc.update({
        chapter_id: v.chapter,
        priority: v.priority,
        title: v.title,
        content: v.content
    })

    ctx.body = doc
})
router.get('/doc/view/:id', loginRequired, async (ctx: Context) => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const doc = await DocModel.findOne({
        where: {
            id: v.id
        },
        include: [ WikiModel, ChapterModel ]
    })

    if( !doc ) throw new ResourceNotFoundError('unknown document')

    ctx.body = doc
})
router.delete('/doc/delete/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const doc: DocModel = await DocModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !doc ) throw new ResourceNotFoundError("unknown document of id " + v.id)

    ctx.body = await doc.destroy()
})

router.delete('/chapter/delete/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const chapter: ChapterModel = await ChapterModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !chapter ) throw new ResourceNotFoundError("unknown chapter of id " + v.id)

    ctx.body = await chapter.destroy()
})
router.get('/chapter/view/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    ctx.body = await ChapterModel.findOne({
        where: {
            id: v.id
        },
        include: [ DocModel ]
    })
})
router.get('/chapter/list/:id', async ctx => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const wikiID = v.id

    ctx.body = await ChapterModel.findAll({
        where: {
            wiki_id: wikiID
        },
        include: [ DocModel ]
    })
})
router.post('/chapter/tree/:id', async ctx => {
    const v: ChapterTreeValidator = await new ChapterTreeValidator().validate(ctx)

    const wikiID = v.id
    const root = v.root

    ctx.body = await ChapterModel.findAll({
        where: {
            wiki_id: wikiID,
            parent: root
        },
        include: [ DocModel ]
    })
})
router.post('/chapter/create', loginRequired, async (ctx: Context) => {
    const v: ChapterCreateValidator = await new ChapterCreateValidator().validate(ctx)

    const { currentUser } = ctx

    const wiki = await WikiModel.findOne({
        where: {
            id: v.wiki
        },
        include: [ WikiMember, ChapterModel ]
    })

    const memberLevel = wiki.memberLevel(currentUser.id)
    if( memberLevel === WikiMemberPermission.NONE ) {

        // check if user have admin permission
        await adminRequired(ctx, async() => {})

        // throw new AuthFailedError("access denied")

    }

    // TODO CHAPTER CREATE LOG

    ctx.body = await ChapterModel.create({
        wiki_id: wiki.id,
        priority: 0,
        parent: v.parentChapter,
        title: v.title
    })

})
router.post('/chapter/modify/:id', loginRequired, async (ctx: Context) => {
    const v: ChapterUpdateValidator = await new ChapterUpdateValidator().validate(ctx)

    const chapter = await ChapterModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !chapter || chapter.wiki_id !== v.wiki ) throw new ResourceNotFoundError('unknown chapter')

    const { currentUser } = ctx

    const wiki = await WikiModel.findOne({
        where: {
            id: v.wiki
        },
        include: [ WikiMember, ChapterModel ]
    })

    const memberLevel = wiki.memberLevel(currentUser.id)
    if( memberLevel === WikiMemberPermission.NONE ) {

        // check if user have admin permission
        await adminRequired(ctx, async() => {})

        // throw new AuthFailedError("access denied")

    }

    // TODO CHAPTER UPDATE LOG

    await chapter.update({
        parent: v.parentChapter,
        title: v.title,
        priority: v.priority
    })

    ctx.body = chapter

})

router.get('/view/:id', async (ctx: Context) => {
    const v: WikiViewValidator = await new WikiViewValidator().validate(ctx)

    const wikiID = v.id

    const model = await WikiModel.findOne({
        where: { id: wikiID },
        include: [ ChapterModel, {
            model: WikiMember,
            include: [ UserModel ]
        } ]
    })

    if( model.permission !== WikiPermission.PUBLIC_TO_ALL ) {

        await loginRequired(ctx, async () => {
        })

        try {

            await adminRequired(ctx, () => {})

        } catch ( e ) {

            const members = model.members

            let match = false
            for ( const member of members ) {

                if ( member.member_id === ctx.currentUser.id) {
                    match = true
                    break;
                }

            }

            if( !match ) throw new AuthFailedError("do not have permission to view")

        }

    }

    ctx.body = model

})

router.post('/create', loginRequired, async (ctx: Context) => {
    const v: WikiCreateValidator = await new WikiCreateValidator().validate(ctx)

    const { currentUser } = ctx
    const model = await WikiModel.create({
        type: WikiType.PERSONAL_WIKI,
        title: v.title,
        desc: v.description,
        image: v.cover,
        permission: v.permission
    })

    const wikiMember = await WikiMember.create({
        wiki_id: model.id,
        permission: WikiMemberPermission.OWNER,
        member_id: currentUser.id
    })

    model.members = [ wikiMember ]

    ctx.body = model
})
router.post('/modify/:id', loginRequired, async (ctx: Context) => {
    const v: WikiModifyValidator = await new WikiModifyValidator().validate(ctx)

    const { currentUser } = ctx

    const model = await WikiModel.findOne({
        where: {
            id: v.id
        },
        include: [ WikiMember ]
    })

    try {

        await adminRequired(ctx, () => {})

    } catch ( e ) {

        const members = model.members

        let match = false
        for ( const member of members ) {

            // TODO ONLY OWNER COULD SET ADMIN
            if ( (member.permission === WikiMemberPermission.OWNER || member.permission === WikiMemberPermission.ADMIN) && member.member_id === currentUser.id ) {
                match = true
                break;
            }

        }

        if( !match ) throw new AuthFailedError("do not have permission to modify")

    }

    await model.update({
        title: v.title,
        desc: v.description,
        image: v.cover,
        permission: v.permission
    })

    ctx.body = model
})

router.get('/my/:page', loginRequired, async (ctx: Context) => {
    const v: WikiListPageValidator = await new WikiListPageValidator().validate(ctx)

    const { currentUser } = ctx

    // 获取自己有权限的维基 # 那么就是有member
    ctx.body = await WikiModel.findAndCountAll({
        offset: v.page * Setting.page.size,
        limit: Setting.page.size,
        include: [
            {
                model: ChapterModel,
                as: "chapters"
            },
            {
                model: WikiMember,
                as: "members",
                where: {
                    member_id: currentUser.id
                }
            }
        ]
    })
})

router.get('/list/:page', adminRequired, async (ctx: Context) => {
    const v: WikiListPageValidator = await new WikiListPageValidator().validate(ctx)

    ctx.body = await WikiModel.findAndCountAll({
        offset: Math.max(v.page, 0) * Setting.page.size,
        limit: Setting.page.size,
        include: [ ChapterModel, WikiMember ]
    })
})

export default () => router
