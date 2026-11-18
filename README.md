# litowian

A minimal shared listening room for public SoundCloud tracks/playlists.

## Deploy
GitHub Actions publishes the static site to GitHub Pages. In repository Settings → Pages, set **Source** to **GitHub Actions**. Site URL: https://solevuhah.github.io/litowian/

## Realtime setup
The app uses Supabase Realtime Broadcast. Create a free project at https://supabase.com, then copy the Project URL and anon/publishable key from Project Settings → API. Open litowian, tap ⚙ and save both values on each device/browser. Never use a service_role key.

Enable Realtime for Broadcast in the Supabase project. Rooms use random channel names and ephemeral broadcasts; no user account or room database is required.

## Notes
- Supports public SoundCloud track/playlist URLs that can be embedded.
- Both listeners need the same Supabase project configured once.
- This is a prototype: it does not guarantee millisecond-perfect sync.
- iOS Safari may suspend web audio when backgrounded, switching apps/games, or locking the screen. Background playback is not guaranteed by a website; test on the target iPhone.
- SoundCloud controls and autoplay remain subject to SoundCloud and browser policies.
