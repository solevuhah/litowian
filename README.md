# litowian

A Windows-hosted realtime listening room. No Supabase account or API keys.

## First run on Windows 11
1. Install Node.js LTS from https://nodejs.org/ (once).
2. Download this repository as ZIP and extract it.
3. Double-click `Start-litowian.bat`.
4. On first run it installs the app dependency and Cloudflare Tunnel (using winget).
5. Wait until the terminal shows a public HTTPS URL ending in `trycloudflare.com`.
6. Open that HTTPS URL on your PC, create a room, and press **Invite**.
7. Send the copied invite link. Your friend opens it and lands directly in that room.

Keep both terminal windows open and keep your PC awake. The public tunnel URL changes when restarted, so create a fresh invite after restarting.

## Important
The quick tunnel makes this app reachable from the internet. Anyone with a room invite can join that room. Share invite links only with people you trust. Do not share Windows passwords or remote-access credentials. Do not open router ports.

## Supported playback
- SoundCloud official embed: Play/Pause/seek sync when the embed is available to both listeners.
- Direct audio file URLs: Play/Pause/seek sync. Only use files you own or have permission to share.
- Other service URLs are passed as links but do not currently offer shared playback control.
- This app does not proxy, download, or rebroadcast SoundCloud audio. A PC VPN cannot make a restricted SoundCloud stream available to another listener.
- iOS Safari may pause playback in the background; background audio is not guaranteed.

Rooms are temporary and live in server memory. Keep the PC and both terminal windows running while listening.
