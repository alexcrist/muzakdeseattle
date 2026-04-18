# 🎵 Music League — Setup Guide
## Complete instructions for getting this running online, for free.

This guide walks you through every step. You do not need to know how to code.
Estimated time: 20–30 minutes.

---

## What you'll be setting up

- **Supabase** — the database that stores all your players, songs, votes, and comments (free)
- **Netlify** — the website host that serves the app to your friends (free)

---

## PART 1: Set up Supabase (the database)

### Step 1 — Create a Supabase account
1. Go to **https://supabase.com**
2. Click **Start your project** → sign up with GitHub or email
3. Once logged in, click **New Project**
4. Fill in:
   - **Name:** music-league (or whatever you like)
   - **Database Password:** make something up and save it somewhere (you won't need it again but good to have)
   - **Region:** pick the one closest to you (US East, US West, etc.)
5. Click **Create new project** — wait about 60 seconds for it to spin up

---

### Step 2 — Create the database tables

1. In your Supabase project, look at the left sidebar
2. Click **SQL Editor** (looks like `</>`)
3. Click **New query**
4. Copy and paste ALL of the following SQL into the editor, then click **Run**:

```sql
-- PLAYERS
create table players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- LEAGUE SETTINGS (single row)
create table league_settings (
  id int primary key default 1,
  league_name text default 'Music League',
  points_per_player int default 10,
  default_submission_hours int default 48,
  default_voting_hours int default 48,
  is_paused boolean default false,
  paused_at timestamptz
);
insert into league_settings (id) values (1);

-- ROUNDS
create table rounds (
  id uuid primary key default gen_random_uuid(),
  theme_name text not null,
  theme_description text not null,
  queue_position int not null default 0,
  status text not null default 'pending',
  submission_deadline timestamptz,
  voting_deadline timestamptz,
  submitted_by_player_id uuid references players(id),
  created_at timestamptz default now()
);

-- SONGS
create table songs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  player_id uuid references players(id),
  artist text not null,
  title text not null,
  album text,
  link text,
  submitter_note text,
  created_at timestamptz default now(),
  unique(round_id, player_id)
);

-- VOTES
create table votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  voter_player_id uuid references players(id),
  points int not null default 0,
  created_at timestamptz default now(),
  unique(song_id, voter_player_id)
);

-- COMMENTS
create table comments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  player_id uuid references players(id),
  body text not null,
  created_at timestamptz default now()
);

-- Row Level Security (allows public read/write since there's no auth)
alter table players enable row level security;
alter table league_settings enable row level security;
alter table rounds enable row level security;
alter table songs enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;

create policy "public access" on players for all using (true) with check (true);
create policy "public access" on league_settings for all using (true) with check (true);
create policy "public access" on rounds for all using (true) with check (true);
create policy "public access" on songs for all using (true) with check (true);
create policy "public access" on votes for all using (true) with check (true);
create policy "public access" on comments for all using (true) with check (true);
```

5. You should see **Success. No rows returned** — that means it worked.

---

### Step 3 — Get your Supabase credentials

1. In the left sidebar, click the **Settings** icon (gear ⚙️) at the bottom
2. Click **API**
3. You'll see two things you need — copy both:
   - **Project URL** — looks like `https://abcdefghijklm.supabase.co`
   - **anon public** key — a long string under "Project API keys"

---

### Step 4 — Add your credentials to the app code

1. Open the file: `src/lib/supabase.js`
2. Find these two lines near the top:
   ```
   const SUPABASE_URL = 'YOUR_SUPABASE_URL'
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
   ```
3. Replace `YOUR_SUPABASE_URL` with your Project URL (keep the quotes)
4. Replace `YOUR_SUPABASE_ANON_KEY` with your anon public key (keep the quotes)
5. Save the file

It should look something like:
```js
const SUPABASE_URL = 'https://abcdefghijklm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5...(very long string)'
```

---

## PART 2: Build the app

### Step 5 — Install Node.js (one-time setup)

1. Go to **https://nodejs.org**
2. Download and install the **LTS** version (the one that says "Recommended for most users")
3. Follow the installer — just click Next/Continue through everything

---

### Step 6 — Build the app files

1. Open **Terminal** (Mac: press Cmd+Space, type "Terminal") or **Command Prompt** (Windows: press Win key, type "cmd")
2. Navigate to the music-league folder. Type:
   ```
   cd path/to/musicleague
   ```
   Replace `path/to/musicleague` with the actual folder location.
   
   **Tip:** On Mac, you can type `cd ` (with a space) then drag the folder from Finder into the Terminal window — it'll fill in the path automatically.

3. Install dependencies (only needed once):
   ```
   npm install
   ```
   Wait for it to finish — you'll see a lot of text scroll by, that's normal.

4. Build the app:
   ```
   npm run build
   ```
   This creates a `dist` folder. That folder is your entire website.

---

## PART 3: Deploy to Netlify

### Step 7 — Create a Netlify account

1. Go to **https://netlify.com**
2. Sign up — you can use your email or GitHub

---

### Step 8 — Deploy by drag and drop

1. After logging in, you'll see the Netlify dashboard
2. Look for a section that says **"drag and drop your site folder here"** (it's in the main area)
3. Open your file explorer / Finder
4. Navigate to your `musicleague` folder
5. Find the `dist` folder inside it
6. **Drag the `dist` folder** directly into the Netlify browser window
7. Wait a few seconds — Netlify will give you a URL like `https://cheerful-cat-abc123.netlify.app`

**That URL is your Music League.** Share it with your friends.

---

### Step 9 — (Optional) Give it a better URL

1. In Netlify, go to **Site settings → Domain management**
2. Click **Options → Edit site name**
3. You can change `cheerful-cat-abc123` to something like `daniels-music-league`
4. Your URL becomes `https://daniels-music-league.netlify.app`

---

## PART 4: First-time league setup

### Step 10 — Configure and start the league

1. Open your new URL in the browser
2. Enter your name to join
3. Tap **Menu → Settings**
4. Set your **league name**, **points per player**, and **default period lengths**
5. Go to **Round Queue** and add your first round (theme name + description)
6. Back in **Settings**, you'll see a **"Start the League"** button — press it
7. The first round's submission period begins immediately
8. Send the URL to your friends!

---

## Updating the app / re-deploying

If you edit the code (e.g. changing flavor text in `src/lib/flavor.js`):
1. Run `npm run build` again in the Terminal
2. Go to Netlify → your site → **Deploys** tab
3. Drag the new `dist` folder into the deploy drop zone

---

## Editing Flavor Text

Open `src/lib/flavor.js` — every string is clearly labeled with a comment showing where it appears.
Edit any of them, save, then rebuild and redeploy (Step 6 + Step 8).

---

## Troubleshooting

**"Cannot find module" error when running npm install**
→ Make sure you're in the right folder (the one with `package.json` in it)

**Page loads but shows nothing / "loading..." forever**
→ Your Supabase credentials are probably wrong. Double-check `src/lib/supabase.js`

**"new row violates row-level security policy"**
→ The RLS policies weren't created. Re-run the SQL from Step 2.

**Friends get a blank page**
→ Make sure you dragged the `dist` folder (not the whole `musicleague` folder) into Netlify

**Voting period ended but round didn't advance**
→ Round transitions happen when someone loads the page. Have someone open the app — it'll catch up automatically.

---

## That's it. Good luck and may your picks slap. 🎵
