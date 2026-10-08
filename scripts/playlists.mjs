#!/usr/bin/env node
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { managementClient, readEnvFile, ROOT, saveVaultSecret, sqlString } from './lib/supabase-management.mjs'

const mode = process.argv[2]
const service = process.argv[3] || 'tidal'
const serviceName = service === 'spotify' ? 'Spotify' : 'Tidal'
const env = { ...readEnvFile('.env.tidal.local'), ...process.env }
const client = managementClient()

function requireValue(name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Add ${name} to .env.tidal.local. Never prefix these secrets with VITE_.`)
  return value
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: client.token },
  })
  if (result.error || result.status !== 0) throw new Error('Deployment stopped. Resolve the command error above and run again.')
}

async function deploy() {
  const secrets = [{ name: 'GEMINI_API_KEY', value: requireValue('GEMINI_API_KEY') }]
  const services = ['tidal', 'spotify'].filter(name => env[`${name.toUpperCase()}_CLIENT_ID`] || env[`${name.toUpperCase()}_CLIENT_SECRET`])
  if (!services.length) throw new Error('Add Tidal or Spotify credentials to .env.tidal.local.')
  for (const name of services) {
    for (const suffix of ['CLIENT_ID', 'CLIENT_SECRET']) {
      const key = `${name.toUpperCase()}_${suffix}`
      secrets.push({ name: key, value: requireValue(key) })
    }
  }
  run(process.execPath, [join(ROOT, 'scripts/migrate.mjs')])

  const previous = await client.sql("select decrypted_secret from vault.decrypted_secrets where name = 'playlist_job_secret'")
  const jobSecret = previous?.[0]?.decrypted_secret || randomBytes(32).toString('hex')
  await client.request('/secrets', [...secrets, { name: 'PLAYLIST_JOB_SECRET', value: jobSecret }])
  await saveVaultSecret(client, 'playlist_job_secret', jobSecret)
  await saveVaultSecret(client, 'playlist_function_url', `${client.projectUrl}/functions/v1/generate-playlists`)

  // Server-side bundling is part of deployment; no local build or checks run.
  run(join(ROOT, 'node_modules/.bin/supabase'), ['functions', 'deploy', 'generate-playlists', '--project-ref', client.ref, '--use-api'])
  await client.sql(`update public.playlist_automation_settings set enabled = true where service in (${services.map(sqlString).join(',')})`)
  console.log('Playlist worker deployed. Schedule: Thursday at 12:05 a.m. Pacific.')
  console.log('Connect each playlist owner with: npm run tidal:connect / npm run spotify:connect')
}

async function connect() {
  if (!['tidal', 'spotify'].includes(service)) throw new Error('Choose tidal or spotify.')
  const clientId = requireValue(`${service.toUpperCase()}_CLIENT_ID`)
  const port = service === 'spotify' ? 8788 : 8787
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const verifier = randomBytes(48).toString('base64url')
  const state = randomBytes(24).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL(service === 'spotify' ? 'https://accounts.spotify.com/authorize' : 'https://login.tidal.com/authorize')
  authorize.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope: service === 'spotify' ? 'playlist-modify-public playlist-read-private' : 'playlists.read playlists.write', code_challenge_method: 'S256',
    code_challenge: challenge, state,
  }).toString()

  const code = await new Promise((resolve, reject) => {
    let exchanging = false
    const server = createServer((request, response) => {
      const url = new URL(request.url || '/', redirectUri)
      if (url.pathname !== '/callback') { response.writeHead(404).end(); return }
      const received = Buffer.from(url.searchParams.get('state') || '')
      const expected = Buffer.from(state)
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        response.writeHead(400).end('Invalid authorization state. Use the sign-in link from your terminal.')
        return
      }
      if (exchanging) { response.writeHead(409).end('Authorization already received.'); return }
      exchanging = true
      clearTimeout(timeout)
      server.close()
      const authCode = url.searchParams.get('code')
      response.writeHead(authCode ? 200 : 400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
      response.end(authCode ? 'Authorization received. You can close this tab; your terminal will confirm the connection.' : `${serviceName} authorization was declined. Try npm run ${service}:connect again.`)
      if (authCode) resolve(authCode)
      else reject(new Error(`${serviceName} authorization was declined or failed.`))
    })
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error(`${serviceName} sign-in timed out. Run npm run ${service}:connect again.`))
    }, 10 * 60 * 1000)
    server.on('error', () => { clearTimeout(timeout); reject(new Error(`Cannot listen on 127.0.0.1:${port}. Close the other listener and retry.`)) })
    server.listen(port, '127.0.0.1', () => {
      console.log(`Open this link and sign in to the ${serviceName} account that should own the public playlists:`)
      console.log(authorize.toString())
    })
  })

  const response = await fetch(service === 'spotify' ? 'https://accounts.spotify.com/api/token' : 'https://auth.tidal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(service === 'spotify' ? { Authorization: `Basic ${Buffer.from(`${clientId}:${requireValue('SPOTIFY_CLIENT_SECRET')}`).toString('base64')}` } : {}),
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`${serviceName} token exchange failed (HTTP ${response.status}). Check the registered redirect URI and playlist permissions.`)
  const credentials = await response.json()
  if (!credentials.access_token || !credentials.refresh_token) throw new Error(`${serviceName} did not return both tokens. Reconnect with playlist permissions.`)
  await client.sql(`select public.playlist_save_oauth(${sqlString(service)}, ${sqlString(JSON.stringify({
    access_token: credentials.access_token, refresh_token: credentials.refresh_token,
    expires_at: Date.now() + Number(credentials.expires_in || 3600) * 1000,
  }))}::jsonb)`)
  console.log(`${serviceName} connected. Tokens are stored in Supabase Vault, never in the app or terminal output.`)
}

try {
  if (mode === 'deploy') await deploy()
  else if (mode === 'connect') await connect()
  else throw new Error('Usage: node scripts/playlists.mjs deploy | connect tidal | connect spotify')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
