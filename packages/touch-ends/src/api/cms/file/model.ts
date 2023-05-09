import {
    AutoIncrement,
    BelongsTo, BelongsToMany,
    Column,
    Comment,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import { FileType } from '../../../lib/util/enums.js'
import { UserModel } from '../user/model.js'

// TODO FILE PERMISSION
export interface IFile {
    id?: number
    type: FileType
    path: string
    name: string
    uuid: string
    extension: string
    size: number
    hash: string
    uploader: UserModel
    uploader_id: number
}
@Table({ tableName: "files" })
export class FileModel extends Model<IFile> {

    @PrimaryKey
    @AutoIncrement
    @Comment("FileID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => UserModel)
    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    uploader_id: string

    @BelongsTo(() => UserModel)
    uploader: UserModel

    @Comment("FileType")
    @Column(DataTypes.INTEGER)
    type: FileType

    @Comment("文件路径")
    @Column(DataTypes.STRING(1024))
    path: string

    @Comment("文件UUID")
    @Column(DataTypes.STRING(48))
    uuid: string

    @Comment("文件名称")
    @Column(DataTypes.STRING(256))
    name: string

    @Comment("文件扩展名")
    @Column(DataTypes.STRING(16))
    extension: string

    @Comment("文件大小")
    @Column(DataTypes.INTEGER)
    size: number
}

sequelize.addModels([FileModel])

await sequelize.sync({
    force: false,
    alter: true
})
