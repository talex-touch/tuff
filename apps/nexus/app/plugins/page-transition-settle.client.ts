/**
 * Settles the page-transition promise that NuxtPage opens and nothing ever closes.
 *
 * When a page with a `pageTransition` suspends, NuxtPage opens `nuxtApp['~transitionPromise']`,
 * and only the `onAfterLeave` of its `<Transition>` resolves it. Until then Nuxt holds back the
 * disposal of every `useHead` entry the leaving page registered, and the router's scroll to the
 * top. When that `<Transition>` has nothing to leave — it mounted fresh because the layout
 * changed, or because the previous page had no transition — `onAfterLeave` never runs and the
 * promise stays pending for the rest of the visit (Nuxt 4.4.8, unchanged in 4.6.0). Going from
 * the docs to `/updates` and back this way kept `body.nexus-updates-single-page`
 * (`overflow: hidden`) on the docs page, and no page after it could scroll.
 *
 * A real leave removes the old page and calls `onAfterLeave` in the same synchronous step, so
 * once the page we navigated away from is out of the document, a promise that is still pending
 * will never settle on its own. This plugin settles it at that point, the way `onAfterLeave`
 * would have; while a leave is still running it does nothing. Delete it once NuxtPage stops
 * opening the promise for a `<Transition>` that has no page to leave.
 */
export default defineNuxtPlugin({
  name: 'nexus:page-transition-settle',
  setup(nuxtApp) {
    const router = useRouter()
    let leavingPage: Node | null = null
    let observer: MutationObserver | null = null

    function stopWatching() {
      observer?.disconnect()
      observer = null
    }

    /** Returns false while the page we navigated away from is still in the document. */
    function settleIfOrphaned(pending: Promise<void>): boolean {
      if (leavingPage?.isConnected)
        return false
      stopWatching()
      if (nuxtApp['~transitionPromise'] === pending) {
        nuxtApp['~transitionFinish']?.()
        delete nuxtApp['~transitionFinish']
        delete nuxtApp['~transitionPromise']
      }
      return true
    }

    router.beforeEach((_to, from) => {
      stopWatching()
      // A route left while it was still suspending never rendered; the page before it is
      // still the one on screen.
      leavingPage = from.matched.at(-1)?.instances.default?.$el ?? leavingPage
    })

    nuxtApp.hook('page:finish', () => {
      const pending = nuxtApp['~transitionPromise']
      if (!pending || observer || settleIfOrphaned(pending))
        return
      // The old page can outlive `page:finish` without leaving: a layout that is still loading
      // keeps the previous one on screen, then drops it without a transition.
      observer = new MutationObserver(() => settleIfOrphaned(pending))
      observer.observe(document.body, { childList: true, subtree: true })
    })
  },
})
