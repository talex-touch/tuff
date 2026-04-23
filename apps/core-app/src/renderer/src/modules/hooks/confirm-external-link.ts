import { useI18nText } from '~/modules/lang'
import { forTouchTip } from '../mention/dialog-mention'

export async function confirmExternalLinkOpen(url: string): Promise<boolean> {
  const { t } = useI18nText()

  return await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (allowed: boolean) => {
      if (settled) return
      settled = true
      resolve(allowed)
    }

    void forTouchTip(t('notifications.externalLinkConfirmTitle'), url, [
      {
        content: t('common.cancel'),
        type: 'info',
        onClick: async () => {
          finish(false)
          return true
        }
      },
      {
        content: t('common.open'),
        type: 'danger',
        onClick: async () => {
          finish(true)
          return true
        }
      }
    ]).then(() => {
      finish(false)
    })
  })
}
