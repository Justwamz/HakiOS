import 'dotenv/config'
import bcrypt from 'bcrypt'
import { db } from './client.js'

const EMAIL = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@hakios.com'
const PASSWORD = process.env['SEED_ADMIN_PASSWORD']

if (!PASSWORD) {
  console.error('SEED_ADMIN_PASSWORD env var is required')
  process.exit(1)
}

const hash = await bcrypt.hash(PASSWORD, 12)

const result = await db.query(
  `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active)
   VALUES (gen_random_uuid(), $1, 'Admin', 'HakiOS', 'admin', $2, true)
   ON CONFLICT (email) DO UPDATE SET password_hash = $2, is_active = true
   RETURNING email`,
  [EMAIL, hash]
)

console.log('Admin user ready:', result.rows[0]?.email)
await db.end()
