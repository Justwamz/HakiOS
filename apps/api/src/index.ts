import 'dotenv/config'
import { createApp } from './app.js'
import { initVapid } from './lib/vapid.js'

initVapid()
const port = Number(process.env['API_PORT'] ?? 3000)
const app = createApp()
app.listen(port, () => {
  console.log(`HakiOS API listening on http://localhost:${port}`)
})
