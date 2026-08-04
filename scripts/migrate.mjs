#!/usr/bin/env node
// Applies pending SQL migrations through the Supabase Management API.
//
// The API needs only a personal access token, so this avoids the database
// password entirely. Applied versions are recorded in
// supabase_migrations.schema_migrations, the same table the Supabase CLI uses,
// so `supabase db push` stays interchangeable with this script.
//
//   node scripts/migrate.mjs           apply pending migrations
//   node scripts/migrate.mjs --dry-run list pending migrations, change nothing
//   node scripts/migrate.mjs --status  show applied and pending

import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const TOKEN_FILE = process.env.MUZAK_TOKEN_FILE || join(homedir(), '.muzak-supabase-token')
const API_BASE = process.env.SUPABASE_API_BASE || 'https://api.supabase.com'

function die(message, hint) {
  console.error(`\n${message}`)
  if (hint) console.error(hint)
  process.exit(1)
}

function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim()
  try {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim()
    if (token) return token
  } catch {
    // fall through to the shared error below
  }
  die(
    `No Supabase access token found at ${TOKEN_FILE}`,
    'Create one at https://supabase.com/dashboard/account/tokens, then see SETUP.md.'
  )
}

function readProjectRef() {
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(ROOT, file), 'utf8')
      const url = text.match(/^(?:NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL)\s*=\s*(.+)$/m)?.[1]?.trim()
      const ref = url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
      if (ref) return ref
    } catch {
      // try the next candidate
    }
  }
  die('Could not determine the Supabase project ref.', 'Expected a SUPABASE_URL in .env.local.')
}

const TOKEN = readToken()
const REF = readProjectRef()

async function runSql(query) {
  const response = await fetch(`${API_BASE}/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const body = await response.text()
  if (!response.ok) {
    if (response.status === 401) {
      die('Supabase rejected the access token (401).', 'Generate a fresh one at https://supabase.com/dashboard/account/tokens.')
    }
    let detail = body
    try {
      detail = JSON.parse(body).message || body
    } catch {
      // keep the raw body
    }
    throw new Error(`HTTP ${response.status}: ${detail}`)
  }

  try {
    return JSON.parse(body)
  } catch {
    return []
  }
}

function localMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => ({
      version: name.match(/^(\d+)/)?.[1] || name.replace(/\.sql$/, ''),
      name: name.replace(/^\d+_/, '').replace(/\.sql$/, ''),
      file: name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
    }))
}

async function appliedVersions() {
  await runSql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text not null primary key,
      statements text[],
      name text
    );
  `)
  const rows = await runSql('select version from supabase_migrations.schema_migrations order by version;')
  return new Set((rows || []).map(row => row.version))
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const statusOnly = args.includes('--status')

  const local = localMigrations()
  const applied = await appliedVersions()
  const pending = local.filter(migration => !applied.has(migration.version))

  if (statusOnly || dryRun) {
    console.log(`\nProject ${REF}\n`)
    for (const migration of local) {
      console.log(`  ${applied.has(migration.version) ? 'applied' : 'PENDING'}  ${migration.file}`)
    }
    console.log(pending.length ? `\n${pending.length} pending.` : '\nUp to date.')
    if (dryRun && pending.length) console.log('Dry run: nothing was applied.')
    return
  }

  if (!pending.length) {
    console.log(`\nUp to date — all ${local.length} migrations already applied to ${REF}.`)
    return
  }

  console.log(`\nApplying ${pending.length} migration(s) to ${REF}:\n`)
  for (const migration of pending) {
    process.stdout.write(`  ${migration.file} ... `)
    try {
      await runSql(migration.sql)
    } catch (error) {
      console.log('FAILED')
      die(`${migration.file} failed to apply:\n  ${error.message}`, 'Nothing further was attempted.')
    }
    await runSql(`
      insert into supabase_migrations.schema_migrations (version, name)
      values ('${migration.version}', '${migration.name.replace(/'/g, "''")}')
      on conflict (version) do nothing;
    `)
    console.log('ok')
  }
  console.log('\nDone.')
}

main().catch(error => die(String(error?.message || error)))
