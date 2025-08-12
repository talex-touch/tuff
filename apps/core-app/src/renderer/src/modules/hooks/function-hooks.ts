// import AgreementTemplate from '~/components/addon/AgreementTemplate.vue'
import { App, createApp } from 'vue'
import Login from '~/views/others/account/Sign.vue'
// import protocol from '~/assets/docs/protocol.md?raw'

/**
 * Creates and mounts a login dialog component
 * @returns {App<Element> | undefined} The Vue app instance or undefined if already mounted
 */
export function useLogin(): App<Element> | undefined {
  // Check if login dialog is already mounted
  if (document.getElementById('Touch-Login')) return undefined

  // Create container element for the login dialog
  const element = document.createElement('div')

  element.id = 'Touch-Login'
  element.className = 'Touch-Dialog fake-background'
  Object.assign(element.style, {
    width: '820px',
    height: '400px',
    boxSizing: 'border-box'
  })

  // Create Vue app instance with Login component
  const app = createApp(Login, {
    close: () => {
      app.unmount()
      document.body.removeChild(element)
    }
  })

  // Mount the app to the DOM
  document.body.appendChild(element)
  app.mount(element)

  return app
}
