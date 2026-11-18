const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(ROOT, '.' + requested);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
function broadcast(room, message, except) {
  for (const client of rooms.get(room)?.clients || []) {
    if (client !== except && client.readyState === 1) client.send(JSON.stringify(message));
  }
}
wss.on('connection', ws => {
  let roomId = null;
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join' && typeof msg.room === 'string' && /^[a-z0-9-]{4,32}$/i.test(msg.room)) {
      if (roomId && rooms.has(roomId)) rooms.get(roomId).clients.delete(ws);
      roomId = msg.room;
      if (!rooms.has(roomId)) rooms.set(roomId, {
        clients: new Set(), track: '', messages: [],
        playback: { action: 'pause', position: 0, updatedAt: Date.now() }
      });
      const room = rooms.get(roomId);
      room.clients.add(ws);
      ws.send(JSON.stringify({
        type:'joined', room:roomId, track:room.track, count:room.clients.size,
        messages:room.messages, playback:room.playback
      }));
      broadcast(roomId, { type:'members', count:room.clients.size }, ws);
      return;
    }
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (msg.type === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.trim().slice(0, 500);
      const nick = (typeof msg.nick === 'string' ? msg.nick : 'Гость').trim().slice(0, 24) || 'Гость';
      if (!text) return;
      const message = { type:'chat', nick, text, time:Date.now() };
      room.messages.push(message);
      if (room.messages.length > 60) room.messages.shift();
      broadcast(roomId, message, ws);
      ws.send(JSON.stringify(message));
    } else if (msg.type === 'track' && typeof msg.url === 'string' && msg.url.length <= 2048) {
      room.track = msg.url;
      room.playback = { action:'pause', position:0, updatedAt:Date.now() };
      broadcast(roomId, { type:'track', url:msg.url }, ws);
    } else if (msg.type === 'control' && ['play','pause','seek'].includes(msg.action)) {
      const position = Number(msg.position);
      const safePosition = Number.isFinite(position) ? Math.max(0, Math.min(position, 24 * 60 * 60 * 1000)) : room.playback.position;
      const updatedAt = Date.now();
      if (msg.action === 'seek') {
        room.playback = { ...room.playback, position:safePosition, updatedAt };
        broadcast(roomId, { type:'control', action:'seek', position:safePosition, updatedAt }, ws);
      } else {
        room.playback = { action:msg.action, position:safePosition, updatedAt };
        broadcast(roomId, { type:'control', ...room.playback }, ws);
      }
    }
  });
  ws.on('close', () => {
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.clients.delete(ws);
    if (!room.clients.size) rooms.delete(roomId);
    else broadcast(roomId, { type:'members', count:room.clients.size });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('litowian is running at http://localhost:' + PORT);
  console.log('Keep this window open while listening.');
});
