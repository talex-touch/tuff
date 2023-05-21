import { TValidator } from '../../../extension/validator/index.js'
import { IsNotEmpty, Length, IsEmail, MinLength, Min, Max } from 'class-validator'

export class OrganizationCreateValidator extends TValidator {
    @IsNotEmpty()
    @Length(2, 32)
    name: string

    @IsNotEmpty()
    @Length(2, 256)
    summary: string

    @IsNotEmpty()
    @Length(2, 256)
    cover: string
}

export class OrganizationInfoValidator extends TValidator {
    @IsNotEmpty()
    id: number
}

export class OrgInviteUserValidator extends TValidator {
    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    user_id: number
}

export class OrgInviteActionValidator extends TValidator {
    @IsNotEmpty()
    id: number // Organization.id

    @IsNotEmpty()
    action: number // InviteActionType

    @IsNotEmpty()
    msg_id: number // UserMsgModel.id
}

export class UpdateInfoValidator extends TValidator {

    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    @Length(2, 32)
    name: string

    @IsNotEmpty()
    @Length(2, 256)
    summary: string

    @IsNotEmpty()
    cover?: string

}
