import webpush from 'web-push'

let initialised = false

export function initVapid(): void {
  const publicKey = process.env['VAPID_PUBLIC_KEY']
  const privateKey = process.env['VAPID_PRIVATE_KEY']
  const subject = process.env['VAPID_SUBJECT']
  if (!publicKey || !privateKey || !subject) {
    console.warn('VAPID keys not configured — push notifications disabled')
    return
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  initialised = true
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!initialised) return
  await webpush.sendNotification(subscription, JSON.stringify(payload))
}
