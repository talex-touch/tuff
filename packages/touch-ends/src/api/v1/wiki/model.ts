import {
    AutoIncrement,
    BelongsTo,
    Column,
    Comment,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import { WikiMemberPermission, WikiPermission, WikiType } from '../../../lib/util/enums.js'
import { UserModel } from '../../cms/user/model.js'

export interface IWiki {
    id?: number,
    type: WikiType,
    title: string,
    desc: string,
    image?: string,
    permission: WikiPermission
    chapters?: ChapterModel[]
    members?: WikiMember[]
}
@Table({ tableName: "wiki" })
export class WikiModel extends Model<IWiki> {

    @PrimaryKey
    @AutoIncrement
    @Comment("用户IdentityID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("维基类型")
    @Column(DataTypes.INTEGER)
    type: WikiType = WikiType.PERSONAL_WIKI

    @Comment("维基名称")
    @Column(DataTypes.STRING(50))
    title: string

    @Comment("维基描述")
    @Column(DataTypes.STRING(100))
    desc: string

    @Comment("维基图片")
    @Column(DataTypes.STRING(128))
    image: string

    @Comment("维基权限")
    @Column(DataTypes.INTEGER)
    permission: WikiPermission

    @HasMany(() => ChapterModel)
    chapters?: ChapterModel[]

    @HasMany(() => WikiMember)
    members?: WikiMember[]

    memberLevel(user_id: number) {
        if( this.members )
            for ( const member of this.members ) {

                if( member.member_id === user_id ) return member.permission

            }

        return WikiMemberPermission.NONE
    }
}

export interface IChapter {
    id?: number,
    wiki?: WikiModel,
    wiki_id: number,
    priority: number,
    parent: number,
    title: string,
    docs: DocModel[]
}
@Table({ tableName: "chapters" } )
export class ChapterModel extends Model<IChapter> {

    @PrimaryKey
    @AutoIncrement
    @Comment("章节ID")
    @Column(DataTypes.INTEGER)
    id: number

    @BelongsTo(() => WikiModel)
    wiki: WikiModel

    @ForeignKey(() => WikiModel)
    @Comment("所属维基ID")
    @Column(DataTypes.INTEGER)
    wiki_id: number

    @Comment("章节优先级")
    @Column(DataTypes.INTEGER)
    priority: number

    @Comment("所属父章节")
    @Column(DataTypes.INTEGER)
    parent: number

    @Comment("章节名称")
    @Column(DataTypes.STRING(32))
    title: string

    @HasMany(() => DocModel)
    docs?: DocModel[]

}

export interface IDocument {
    id?: number,
    wiki?: WikiModel,
    wiki_id: number,
    chapter: ChapterModel,
    chapter_id: number,
    priority: number,
    title: string,
    content: string
}
@Table({ tableName: "documents" } )
export class DocModel extends Model<IDocument> {

    @PrimaryKey
    @AutoIncrement
    @Comment("文档ID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("文档优先级")
    @Column(DataTypes.INTEGER)
    priority: number

    @BelongsTo(() => WikiModel)
    wiki: WikiModel

    @ForeignKey(() => WikiModel)
    @Comment("所属维基ID")
    @Column(DataTypes.INTEGER)
    wiki_id: number

    @BelongsTo(() => ChapterModel)
    chapter: ChapterModel

    @ForeignKey(() => ChapterModel)
    @Comment("所属章节")
    @Column(DataTypes.INTEGER)
    chapter_id: number

    @Comment("文档名称")
    @Column(DataTypes.STRING(64))
    title: string

    @Comment("文档内容")
    @Column(DataTypes.TEXT)
    content: string

}

export interface IWikiMember {
    id?: number,
    wiki?: WikiModel,
    wiki_id: number,
    permission: WikiMemberPermission,
    member_id: number
}
@Table({ tableName: "wiki_members" } )
export class WikiMember extends Model<IWikiMember> {

    @PrimaryKey
    @AutoIncrement
    @Comment("WikiMember ID")
    @Column(DataTypes.INTEGER)
    id: number

    @BelongsTo(() => WikiModel)
    wiki: WikiModel

    @ForeignKey(() => WikiModel)
    @Comment("所属维基ID")
    @Column(DataTypes.INTEGER)
    wiki_id: number

    @Comment("维基成员权限")
    @Column(DataTypes.INTEGER)
    permission: WikiMemberPermission

    @ForeignKey(() => UserModel)
    @Comment("维基成员的UID")
    @Column(DataTypes.INTEGER)
    member_id: number

    @BelongsTo(() => UserModel)
    user: UserModel
}

sequelize.addModels([WikiModel, ChapterModel, DocModel, WikiMember])

await sequelize.sync({
    force: false,
    alter: true
})
