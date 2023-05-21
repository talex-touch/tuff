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
import { UserModel } from '../user/model.js'
import { LogType } from '../../../lib/util/enums.js'

export interface ISystemLog {
    id?: number,
    message: string,
    executor_id: number,
    executor?: UserModel,
    type: LogType,
    status: string,
    method: string,
    path: string
}
@Table({ tableName: "system_logs", updatedAt: false })
export class SystemLog extends Model<ISystemLog> {

    @PrimaryKey
    @AutoIncrement
    @Comment("LogID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => UserModel)
    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    executor_id: string

    @BelongsTo(() => UserModel)
    executor: UserModel

    @Comment("日志信息")
    @Column(DataTypes.STRING(256))
    message: string

    @Comment("日志类别")
    @Column(DataTypes.INTEGER)
    type: LogType

    @Comment("日志状态")
    @Column(DataTypes.STRING(256))
    status: string

    @Comment("日志来源方法")
    @Column(DataTypes.STRING(16))
    method: string

    @Comment("日志来源路径")
    @Column(DataTypes.STRING(1024))
    path: string
}

sequelize.addModels([SystemLog])

await sequelize.sync({
    force: false,
    alter: true
})
