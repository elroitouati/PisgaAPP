import { deletePushSubscription, savePushSubscription } from './api'

/**
 * Public VAPID key — safe to ship to the browser (it identifies the sender to
 * the push service, the private half never leaves the Edge Function). Unset
 * in a dev checkout without it configured; callers below treat that the same
 * as "push isn't supported here".
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushSupported(): boolean {
  return (
    Boolean(VAPID_PUBLIC_KEY) &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Requests permission (the one thing the platform never lets an app skip)
 * and, once granted, subscribes this browser and saves the subscription.
 * Throws if permission is denied or push isn't supported — callers show that
 * as an error state rather than silently doing nothing.
 */
export async function subscribeToPush(userId: string): Promise<void> {
  if (!pushSupported()) {
    throw new Error('push notifications are not supported in this browser')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('notification permission was not granted')
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    }))

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('the browser returned an incomplete push subscription')
  }

  await savePushSubscription(userId, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
}

/** Best-effort: used when a user turns push off, not on account deletion. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await deletePushSubscription(endpoint)
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** PushManager wants raw bytes; VAPID keys are handed out URL-safe base64. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
