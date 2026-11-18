# litowian

A shared listening room for SoundCloud embeds and direct audio-file URLs.

## Deploy
GitHub Actions publishes the static site to GitHub Pages. In repository Settings → Pages, set **Source** to **GitHub Actions**. Site URL: https://solevuhah.github.io/litowian/

## Realtime setup
The app uses Supabase Realtime Broadcast. Create a free project at https://supabase.com, then copy the Project URL and anon/publishable key from Project Settings → API. Open litowian, tap ⚙ and save both values on each device/browser. Never use a service_role key.

Enable Realtime for Broadcast in the Supabase project. Rooms use random channel names and ephemeral broadcasts; no user account or room database is required.

## Music sources
- Public SoundCloud URLs work only where SoundCloud itself is reachable and allows the embed.
- To listen without relying on SoundCloud access, use a direct HTTPS URL to an audio file (MP3, M4A, AAC, OGG, WAV, or FLAC) hosted on a service reachable by both listeners. A normal webpage or SoundCloud track page is not a direct audio-file URL.
- Only share audio you own or have permission to distribute. This app does not download or proxy SoundCloud tracks.
- Both listeners need the same Supabase project configured once.
- This is a prototype: playback synchronization is approximate, not millisecond-perfect.
- iOS Safari may suspend web audio when backgrounded, switching apps/games, or locking the screen. Background playback is not guaranteed by a website.
