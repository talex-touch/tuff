export function useGlobalSearchState() {
  const open = useState<boolean>('tuff-web-search-open', () => false)

  function summonSearch(_trigger?: HTMLElement | null) {
    open.value = true
  }

  function closeSearch() {
    open.value = false
  }

  return {
    open,
    summonSearch,
    closeSearch,
  }
}
