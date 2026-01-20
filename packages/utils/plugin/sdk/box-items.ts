import { hasWindow } from '../../env'

export type BoxItemsAPI = Record<string, any>

const DEFAULT_BOX_ITEMS_ERROR
  = '[Feature SDK] boxItems API not available. Make sure this is called in a plugin context.'

export function useBoxItems(errorMessage = DEFAULT_BOX_ITEMS_ERROR): BoxItemsAPI {
  const boxItemsApi = hasWindow() ? (window as any)?.$boxItems as BoxItemsAPI | undefined : undefined
  if (!boxItemsApi) {
    throw new Error(errorMessage)
  }
  return boxItemsApi
}
