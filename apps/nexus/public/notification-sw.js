globalThis.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  }
  catch {
    payload = {
      title: 'Tuff',
      body: event.data ? event.data.text() : '',
    }
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Tuff'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.tag === 'string' ? payload.tag : 'tuff-notification',
    data: {
      url: typeof payload.url === 'string' ? payload.url : '/',
    },
  }

  event.waitUntil(globalThis.registration.showNotification(title, options))
})

globalThis.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const matchingClient = clients.find(client => client.url === url)
        if (matchingClient)
          return matchingClient.focus()
        return globalThis.clients.openWindow(url)
      }),
  )
})
