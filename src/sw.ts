/// <reference lib="webworker" />
/**
 * Hand-written service worker (injectManifest strategy) — needed because
 * push notifications require a `push` and a `notificationclick` listener,
 * which the auto-generated (generateSW) worker has no hook for.
 */

import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// Same behaviour the old generateSW `navigateFallback` gave: serve the
// cached shell for any navigation, so the installed PWA still opens offline.
// Supabase responses are user-specific and auth-gated, so — as before — they
// are never served from this cache.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/auth\//],
  }),
)

// registerType: 'autoUpdate' posts this once a new worker is installed and
// waiting; injectManifest doesn't wire skipWaiting for you the way generateSW
// does, so the custom worker has to listen for it itself.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

type PushPayload = {
  title: string
  body?: string
  /** In-app path to open on click — defaults to the home screen. */
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Pisga' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    /* a malformed payload still gets a generic notification, not silence */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).pathname === url)
      if (existing) {
        await existing.focus()
      } else {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
