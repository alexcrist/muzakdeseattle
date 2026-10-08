import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function readEnvFile(name) {
  try {
    return Object.fromEntries(readFileSync(join(ROOT, name), 'utf8').split(/\r?\n/).flatMap(line => {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match) return []
      let value = match[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [[match[1], value]]
    }))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

export function managementClient() {
  const env = readEnvFile('.env.local')
  const projectUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const ref = projectUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1]
  if (!ref) throw new Error('Set VITE_SUPABASE_URL in .env.local first.')
  let token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) {
    try { token = readFileSync(join(homedir(), '.muzak-supabase-token'), 'utf8').trim() } catch { /* handled below */ }
  }
  if (!token) throw new Error('Save a Supabase personal access token in ~/.muzak-supabase-token.')

  async function request(path, body, method = 'POST') {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60000),
    })
    // Do not echo provider bodies: a SQL error can include credential literals.
    if (!response.ok) throw new Error(`Supabase ${path.split('?')[0]} returned HTTP ${response.status}.`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  return {
    ref, projectUrl, token, request,
    sql: query => request('/database/query', { query }),
  }
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export async function saveVaultSecret(client, name, value) {
  await client.sql(`do $$ declare v_id uuid; begin
    select id into v_id from vault.secrets where name = ${sqlString(name)};
    if v_id is null then
      perform vault.create_secret(${sqlString(value)}, ${sqlString(name)});
    else
      perform vault.update_secret(v_id, ${sqlString(value)});
    end if;
  end; $$;`)
}
