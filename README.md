# litowian

A Windows-hosted realtime listening room. No Supabase account or API keys.

## Run on Windows 11
1. Install Node.js LTS from https://nodejs.org/ (once).
2. Extract/download this repository to a folder.
3. Double-click `Start-litowian.bat`.
4. Keep the terminal window open. The app opens at http://localhost:8787.

The first launch installs the small WebSocket dependency.

## Invite someone outside your home network
The server listens on your PC. To let another person connect over the internet, you need a trusted HTTPS tunnel to port 8787. Do not expose the PC by opening router ports or sharing remote-access credentials. A local-only run works on your own device/network; an external invite link requires a tunnel URL.

## Supported playback
- SoundCloud official embed: Play/Pause/seek sync when the embed is available to both listeners.
- Direct audio file URLs: Play/Pause/seek sync. Only use files you own or have permission to share.
- Other service URLs are passed as links but do not currently offer shared playback control.
- This app does not proxy, download, or rebroadcast SoundCloud audio. A PC VPN cannot make a restricted SoundCloud stream available to another listener.
- iOS Safari may pause playback in the background; background audio is not guaranteed.

Rooms are temporary and live in server memory. Keep the PC and terminal running while listening.
