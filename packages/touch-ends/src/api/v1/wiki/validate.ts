import { TValidator } from '../../../extension/validator/index.js'
import { IsNotEmpty, Length, Matches, Min, MinLength } from 'class-validator'

export class WikiViewValidator extends TValidator {

    @IsNotEmpty()
    id: number

}

export class ChapterTreeValidator extends TValidator {

    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    root: number

}

export class DocumentCreateValidator extends TValidator {

    @IsNotEmpty()
    wiki: number

    @IsNotEmpty()
    title: string

    // @IsNotEmpty()
    chapter: number

    // @IsNotEmpty()
    content: string

}
export class DocumentUpdateValidator extends TValidator {

    @IsNotEmpty()
    wiki: number

    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    title: string

    // @IsNotEmpty()
    chapter: number

    // @IsNotEmpty()
    content: string

    @IsNotEmpty()
    priority: number

}

export class ChapterCreateValidator extends TValidator {

    @IsNotEmpty()
    parentChapter: number

    @IsNotEmpty()
    wiki: number

    @IsNotEmpty()
    title: string

}

export class ChapterUpdateValidator extends TValidator {

    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    parentChapter: number

    @IsNotEmpty()
    priority: number

    @IsNotEmpty()
    wiki: number

    @IsNotEmpty()
    title: string

}

export class WikiModifyValidator extends TValidator {

    @IsNotEmpty()
    id: number

    @IsNotEmpty()
    title: string

    @IsNotEmpty()
    permission: number

    @IsNotEmpty()
    cover: string

    @IsNotEmpty()
    description: string

}

export class WikiCreateValidator extends TValidator {

    @IsNotEmpty()
    title: string

    @IsNotEmpty()
    permission: number

    @IsNotEmpty()
    cover: string

    @IsNotEmpty()
    description: string

}

export class WikiListPageValidator extends TValidator {

    // @Min(0, {
    //     message: "页数至少应该为0"
    // })
    page?: number

}
