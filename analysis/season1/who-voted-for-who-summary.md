# Who Voted For Who

Source: live Supabase tables in this repo, joined as `votes.voter_player_id -> votes.song_id -> songs.player_id`.

## Scope

- Completed rounds with votes: 12
- Completed rounds total: 13
- Vote rows included: 323
- Total awarded points: 390
- Self-vote rows found: 0
- Vote rows skipped because the song record was missing: 0

## Top Directed Pairs

| Voter | Recipient | Points | Vote rows | Rounds |
| --- | --- | --- | --- | --- |
| Clare | Luzak | 11 | 5 | 5 |
| Crusticle | David | 9 | 7 | 7 |
| David | Clare | 9 | 7 | 7 |
| Faffer Dan | Clare | 9 | 5 | 5 |
| Faffer Dan | Luzak | 9 | 6 | 6 |
| Luzak | Crusticle | 9 | 8 | 8 |
| Zach | Luzak | 8 | 7 | 7 |
| David | Luzak | 7 | 5 | 5 |
| Luzak | Clare | 7 | 5 | 5 |
| Malcolm | David | 7 | 4 | 4 |
| Malcolm | Luzak | 7 | 7 | 7 |
| Zach | David | 7 | 5 | 5 |
| Clare | Faffer Dan | 6 | 4 | 4 |
| Julia | Yasmama | 6 | 6 | 6 |
| Morg | Faffer Dan | 6 | 4 | 4 |

## Player Totals

| Player | Given | Received | Net |
| --- | --- | --- | --- |
| Luzak | 40 | 58 | 18 |
| David | 40 | 47 | 7 |
| Clare | 40 | 45 | 5 |
| Crusticle | 33 | 41 | 8 |
| Zach | 37 | 34 | -3 |
| Yasmama | 30 | 33 | 3 |
| Malcolm | 40 | 31 | -9 |
| Faffer Dan | 40 | 28 | -12 |
| hal | 24 | 26 | 2 |
| Morg | 33 | 25 | -8 |
| Julia | 33 | 22 | -11 |

## Files

- `who-voted-for-who.svg`: heatmap plot
- `who-voted-for-who.csv`: directed pair totals
- `who-voted-for-who-player-totals.csv`: per-player totals
