import Setting from '../../config/setting.js'
import path from 'path'
import chalk from 'chalk'
import fs from 'fs'
import { createAllDirectorySync } from '../../lib/util/common.js'
import nodemailder from 'nodemailer'
import { ResourceNotFoundError } from '../../error/base-error.js'

const mailDir = path.resolve(__dirname, Setting.dir.mail)
if( !fs.existsSync(mailDir) ) createAllDirectorySync(mailDir)

console.log("EMail", "Email import templates from: " + chalk.grey(mailDir))

const transporter = nodemailder.createTransport({
    service: '126',
    port: Setting.email['126'].port,
    auth: Setting.email['126'].auth
})

console.log("Email", "Email service started!")

export async function sendTemplateTo(receiverEmail: string, subject: string, template: string, replacer: Function) {
    const templateDir = path.resolve(mailDir, template);

    console.log("Email", "Load template from name: " + template)

    if( !fs.existsSync(templateDir) ) {

        console.warn("Email", "Cannot load template from path: " + templateDir)

        throw new ResourceNotFoundError('unknown email template')

    }

    const html: string = fs.readFileSync(templateDir, 'utf-8')

    const mailOption = {
        from: Setting.email['126'].from,
        to: receiverEmail,
        subject,
        html: replacer ? replacer(html) : html
    }

    return await transporter.sendMail(mailOption);
}

export default () => {}
