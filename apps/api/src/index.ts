import 'dotenv/config'
import { createApp } from './app.js'
import { initVapid } from './lib/vapid.js'
import { runReminders } from './services/reminders.js'

initVapid()
const port = Number(process.env['API_PORT'] ?? 3000)
const app = createApp()
app.listen(port, () => {
  console.log(`HakiOS API listening on http://localhost:${port}`)
  setTimeout(() => {
    runReminders().catch((err) => console.error('[reminders] startup run failed:', err))
  }, 5_000)
  setInterval(() => {
    runReminders().catch((err) => console.error('[reminders] daily run failed:', err))
  }, 24 * 60 * 60 * 1_000)
})
