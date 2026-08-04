# Muzak Season 2 Design

> **Status: historical.** This is the original Season 2 design, written 2026-06-26 and kept as a record of the intent behind the rebuild. It predates round sides, and it describes a Leaderboard section that shipped as standings inside Players. For current behavior, read `CLAUDE.md`.

## Goal

Rebuild Muzak in place as Season 2 while preserving Season 1 data in its existing Supabase project. Season 2 uses the current Netlify app deployment model, but points at a fresh Supabase database with a clean schema.

## Operating Model

- Keep the no-auth friend-group model.
- Player identity remains localStorage plus a public `players` table.
- Admin controls remain open to everyone, with prominent warnings.
- Replace manual phase advancement and pause/deadline-shifting logic with calendar-derived phases.
- Remove legacy Season 1 lifecycle code instead of preserving compatibility shims.

## Data Model

Season 2 uses these primary tables:

- `players`: editable `name`, `active`, optional `avatar_url`, generated `avatar_color`, `created_at`, `updated_at`.
- `league_settings`: one row with league name, season label, points per player, weekly phase template JSON, schedule start date, and timezone.
- `rounds`: queue/history records with theme, description, queue position, creator, optional `week_start_date`, and archive flag.
- `songs`: one song per player per round.
- `votes`: points cast by a player for a submitted song.
- `comments`: comments attached to the submitted song where they were made.
- `duplicate_groups`: admin-created post-voting merge groups per round.
- `duplicate_group_songs`: members of each duplicate group, including a canonical display song.

Votes remain attached to original songs. Derived views in the app compute merged entries and leaderboards.

## Weekly Scheduler

The default weekly template is:

- Monday-Wednesday: submission
- Thursday-Saturday: voting
- Sunday: appreciation

The scheduler is stored in `league_settings.weekly_phase_template` and interpreted in `America/Los_Angeles`. Phase boundaries occur at midnight Pacific.

The app computes the current round and phase from:

- `schedule_start_date`, a Monday date in Pacific time.
- Each round's `queue_position`.
- The weekly template.

Round `N` starts `N` weeks after `schedule_start_date`. The current phase is computed client-side from the Pacific calendar date. This means the app is correct even if nobody had it open at midnight.

Admins can edit the weekly template with seven day tiles. Each day can be `submission`, `voting`, `appreciation`, or `off`.

## Player Profiles

Players can edit their display name and upload a profile picture to Supabase Storage. If no picture is uploaded, the UI shows a generated bubble avatar based on name/color. Avatars appear in player lists, comments once revealed, standings, and profile surfaces.

## Game Flow

Main sections:

- **Home**: current round, phase, countdown, player action, progress, and phase-specific song/comment surface.
- **Rounds**: upcoming queue plus past rounds in one place.
- **Leaderboard**: standings and round breakdown with duplicate scoring applied.
- **Players**: player directory and current-player profile editing.
- **Admin**: warning zone, league settings, schedule editor, duplicate merge tools, and setup guidance.

Phase behavior:

- **Submission**: players submit or edit their song; progress shows active submissions.
- **Voting**: songs are anonymous; players allocate points to other players' songs; comments are anonymous except to their author.
- **Appreciation**: results, submitters, and comment authors are revealed; named comments continue; admins can merge duplicates.
- **Off**: Home shows the current/next phase and relevant round context.

## Duplicate Handling

Duplicate merging is admin-only in the open Admin zone and is intended for appreciation or later.

Rules:

- A duplicate group contains two or more submitted songs from the same round.
- One member is canonical for display metadata.
- Merged vote total is the sum of all eligible votes cast on any member song.
- A vote is ineligible if the voter submitted any song in that duplicate group.
- Courtesy bonus is `submitter_count - 1`.
- Final merged total is eligible vote total plus courtesy bonus.
- Each duplicate submitter receives the full final merged total on the leaderboard.
- Non-duplicate songs score normally from eligible votes.

Because votes stay on original songs, merging after voting gracefully recalculates totals. Ineligible self-votes are removed from scoring rather than displayed as valid points.

## UI Direction

Season 2 should feel bubblegum, bright, and playful without becoming a marketing landing page. The first screen is the game surface, not an intro page.

Visual system:

- Soft candy colors: bubblegum pink, lemon, aqua, grape, mint, and near-white backgrounds.
- Tight 8px-radius cards only for repeated items and controls.
- Round phase uses clear color-coded labels and compact progress stats.
- Avatar circles and pill controls carry the playful identity.
- Use emoji sparingly where existing app culture supports it, but rely on clear UI text and shape.

## Deployment

- Replace hardcoded Supabase credentials with Vite env variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Keep Netlify SPA redirects.
- Document fresh Supabase setup SQL and Netlify env-var configuration.
- Document connecting `muzakdeseattle.com` through Cloudflare to the existing Netlify site.

## Verification

- Run `npm run build`.
- Start the Vite dev server for local review.
- Manually inspect the primary flows where possible:
  - join/register
  - profile edit
  - submit
  - vote
  - appreciation/results
  - duplicate merge controls
  - schedule settings

## Self-Review

- No unresolved placeholders.
- The scheduler is single-template weekly scheduling, not per-round dates.
- Appreciation reveals results, submitters, and comment authors.
- Duplicate merges happen after voting but can recompute prior votes safely.
- No-auth/open-admin model is explicit.
