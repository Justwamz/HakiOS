import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const client = new Client({ connectionString })
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrationsDir = join(__dirname, 'migrations')
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1',
      [file],
    )
    if ((rows as unknown[]).length > 0) {
      console.log(`  skip  ${file}`)
      continue
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`  ran   ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }

  await client.end()
  console.log('Migrations complete.')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
