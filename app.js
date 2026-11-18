const $ = id => document.getElementById(id);
let socket = null, roomId = null, player = null, audio = null, currentTrack = '';
let trackDuration = 0, currentPosition = 0, draggingProgress = false;
const remoteEcho = Object.create(null);

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2400);
}
function isSoundCloud(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'soundcloud.com' || h.endsWith('.soundcloud.com'); }
  catch { return false; }
}
function isDirectAudio(url) {
  try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(new URL(url).pathname); }
  catch { return false; }
}
function markRemote(action) { remoteEcho[action] = Date.now() + 2500; }
function consumeRemote(action) {
  if ((remoteEcho[action] || 0) >= Date.now()) { delete remoteEcho[action]; return true; }
  delete remoteEcho[action];
  return false;
}
function send(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function connect(room) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(proto + '//' + location.host);
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', room }));
    if (currentTrack) socket.send(JSON.stringify({ type: 'track', url: currentTrack }));
  };
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'joined') {
      if (msg.track && !currentTrack) setTrack(msg.track, false);
      $('status').textContent = 'Комната синхронизирована';
      $('members').textContent = msg.count + ' в комнате';
      (msg.messages || []).forEach(renderChatMessage);
    }
    if (msg.type === 'members') $('members').textContent = msg.count + ' в комнате';
    if (msg.type === 'track') setTrack(msg.url, false);
    if (msg.type === 'control') applyControl(msg);
    if (msg.type === 'chat') renderChatMessage(msg);
  };
  socket.onclose = () => { $('status').textContent = 'Связь с хостом потеряна'; };
  socket.onerror = () => { $('status').textContent = 'Не удалось подключиться к серверу ПК'; };
}
function formatTime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
function updateProgress(position, duration) {
  if (Number.isFinite(duration) && duration > 0) trackDuration = duration;
  if (Number.isFinite(position) && position >= 0) currentPosition = position;
  const max = trackDuration || 1;
  if (!draggingProgress) $('progress').value = String(Math.min(1000, currentPosition / max * 1000));
  $('elapsed').textContent = formatTime(currentPosition);
  $('duration').textContent = formatTime(trackDuration);
}
function setTrackInfo(sound) {
  if (!sound) return;
  $('track-title').textContent = sound.title || 'Без названия';
  $('track-artist').textContent = sound.user?.username || 'SoundCloud';
  if (sound.artwork_url) $('track-art').src = sound.artwork_url;
  else $('track-art').removeAttribute('src');
  if (sound.permalink_url) $('soundcloud-source').href = sound.permalink_url;
}
function setTrack(url, announce = true) {
  currentTrack = url;
  player = null;
  audio = null;
  trackDuration = 0;
  currentPosition = 0;
  $('player-placeholder').classList.add('hidden');
  $('link-player').classList.add('hidden');
  $('custom-player').classList.add('hidden');
  $('sc-player').src = 'about:blank';
  $('audio-player').pause();
  $('audio-player').removeAttribute('src');
  $('audio-player').load();
  $('track-title').textContent = 'Загрузка трека…';
  $('track-artist').textContent = ' ';
  $('track-art').removeAttribute('src');
  updateProgress(0, 0);
  $('play-toggle').textContent = 'Ⅱ';
  if (announce) send({ type: 'track', url });

  if (isSoundCloud(url)) {
    $('custom-player').classList.remove('hidden');
    $('status').textContent = 'Загрузка SoundCloud…';
    const frame = $('sc-player');
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=false&buying=false&sharing=false&download=false';
    frame.onload = () => {
      if (currentTrack !== url || !window.SC?.Widget) return;
      const widget = SC.Widget(frame);
      player = widget;
      widget.bind(SC.Widget.Events.READY, () => {
        if (player !== widget || currentTrack !== url) return;
        widget.getCurrentSound(setTrackInfo);
        widget.getDuration(duration => { if (player === widget) updateProgress(currentPosition, duration); });
        widget.getPosition(position => { if (player === widget) updateProgress(position, trackDuration); });
        widget.bind(SC.Widget.Events.PLAY, () => {
          if (player !== widget) return;
          $('play-toggle').textContent = 'Ⅱ';
          if (!consumeRemote('play')) send({ type: 'control', action: 'play' });
        });
        widget.bind(SC.Widget.Events.PAUSE, () => {
          if (player !== widget) return;
          $('play-toggle').textContent = '▶';
          if (!consumeRemote('pause')) send({ type: 'control', action: 'pause' });
        });
        widget.bind(SC.Widget.Events.PLAY_PROGRESS, event => {
          if (player === widget && event) updateProgress(event.currentPosition, trackDuration);
        });
        widget.bind(SC.Widget.Events.SEEK, event => {
          if (player !== widget) return;
          const position = Number(event?.currentPosition) || 0;
          updateProgress(position, trackDuration);
          if (!consumeRemote('seek')) send({ type: 'control', action: 'seek', position });
        });
        widget.bind(SC.Widget.Events.FINISH, () => {
          if (player === widget) $('play-toggle').textContent = '▶';
        });
        $('status').textContent = 'Плеер готов';
      });
    };
  } else if (isDirectAudio(url)) {
    $('custom-player').classList.remove('hidden');
    audio = $('audio-player');
    audio.src = url;
    $('track-title').textContent = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Аудиофайл');
    $('track-artist').textContent = 'Прямой аудиофайл';
    audio.onloadedmetadata = () => updateProgress(0, audio.duration * 1000);
    audio.ontimeupdate = () => updateProgress(audio.currentTime * 1000, audio.duration * 1000);
    audio.onplay = () => { $('play-toggle').textContent = 'Ⅱ'; if (!consumeRemote('play')) send({ type: 'control', action: 'play' }); };
    audio.onpause = () => { $('play-toggle').textContent = '▶'; if (!consumeRemote('pause')) send({ type: 'control', action: 'pause' }); };
    audio.onseeked = () => { if (!consumeRemote('seek')) send({ type: 'control', action: 'seek', position: audio.currentTime * 1000 }); };
    audio.onerror = () => $('status').textContent = 'Аудиофайл недоступен в этом браузере.';
    $('status').textContent = 'Аудиофайл готов';
  } else {
    $('link-player').classList.remove('hidden');
    $('open-track').href = url;
    $('status').textContent = 'Для этой ссылки нет совместимого встроенного плеера.';
  }
}
function applyControl(msg) {
  if (!['play', 'pause', 'seek'].includes(msg.action)) return;
  if (player) {
    if (msg.action === 'play' || msg.action === 'pause') markRemote(msg.action);
    if (msg.action === 'seek') markRemote('seek');
    if (msg.action === 'play') player.play();
    if (msg.action === 'pause') player.pause();
    if (msg.action === 'seek') player.seekTo(Math.max(0, Number(msg.position) || 0));
  }
  if (audio) {
    if (msg.action === 'play' || msg.action === 'pause') markRemote(msg.action);
    if (msg.action === 'play') audio.play().catch(() => toast('Нажмите Play на этом устройстве, чтобы разрешить звук.'));
    if (msg.action === 'pause') audio.pause();
    if (msg.action === 'seek') { markRemote('seek'); audio.currentTime = Math.max(0, Number(msg.position) || 0) / 1000; }
  }
}
function togglePlayback() {
  if (player) {
    player.isPaused(paused => {
      if (player && paused) player.play();
      else if (player) player.pause();
    });
  } else if (audio) {
    if (audio.paused) audio.play().catch(() => toast('Браузер не разрешил воспроизведение.'));
    else audio.pause();
  }
}
function seekBy(delta) {
  const seek = position => {
    const target = Math.max(0, Math.min(trackDuration || Infinity, position + delta));
    markRemote('seek');
    if (player) player.seekTo(target);
    else if (audio) audio.currentTime = target / 1000;
    send({ type: 'control', action: 'seek', position: target });
  };
  if (player) player.getPosition(position => seek(Number(position) || 0));
  else if (audio) seek(audio.currentTime * 1000);
}
$('play-toggle').onclick = togglePlayback;
$('backward').onclick = () => seekBy(-10000);
$('forward').onclick = () => seekBy(10000);
$('progress').addEventListener('input', () => {
  draggingProgress = true;
  const position = Number($('progress').value) / 1000 * trackDuration;
  $('elapsed').textContent = formatTime(position);
});
$('progress').addEventListener('change', () => {
  const position = Number($('progress').value) / 1000 * trackDuration;
  draggingProgress = false;
  markRemote('seek');
  if (player) player.seekTo(position);
  if (audio) audio.currentTime = position / 1000;
  send({ type: 'control', action: 'seek', position });
});

function inviteUrl() {
  if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) return null;
  const u = new URL(location.href);
  u.searchParams.set('room', roomId);
  if (currentTrack) u.searchParams.set('track', currentTrack);
  else u.searchParams.delete('track');
  return u.href;
}
function refreshInvite() {
  const url = inviteUrl(), field = $('invite-link');
  if (field) {
    field.value = url || 'Открой сайт через публичную ссылку *.trycloudflare.com';
    field.classList.toggle('local-warning', !url);
  }
}
function enter(id, track) {
  roomId = id;
  currentTrack = track || '';
  $('home').classList.add('hidden');
  $('room').classList.remove('hidden');
  $('room-name').textContent = 'Комната ' + id.slice(0, 6).toUpperCase();
  const u = new URL(location.href);
  u.searchParams.set('room', id);
  if (track) u.searchParams.set('track', track);
  history.replaceState({}, '', u.pathname + u.search);
  if (track) setTrack(track, false);
  refreshInvite();
  connect(id);
}
$('create').onclick = () => {
  const track = $('track').value.trim();
  let u;
  try { u = new URL(track); } catch {}
  if (!u || !['http:', 'https:'].includes(u.protocol)) { toast('Вставьте корректную ссылку https://'); return; }
  enter(Math.random().toString(36).slice(2, 10), track);
  send({ type: 'track', url: track });
};
$('join').onclick = () => {
  const value = prompt('Вставьте ссылку-приглашение');
  if (!value) return;
  try {
    const u = new URL(value), id = u.searchParams.get('room'), track = u.searchParams.get('track');
    if (!id) throw new Error('room');
    enter(id, track || '');
  } catch { toast('Ссылка приглашения некорректна'); }
};
async function shareInvite() {
  const url = inviteUrl();
  if (!url) { toast('Открой комнату по публичной HTTPS-ссылке, не через localhost'); return; }
  refreshInvite();
  if (navigator.share) {
    try { await navigator.share({ title: 'Приглашение в litowian', text: 'Заходи слушать музыку вместе:', url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — отправь её участнику'); }
  catch { $('invite-link').focus(); $('invite-link').select(); toast('Ссылка выделена — скопируй её'); }
}
$('copy').onclick = shareInvite;
function renderChatMessage(msg) {
  const box = $('chat-messages');
  const empty = box.querySelector('.chat-empty');
  if (empty) empty.remove();
  const item = document.createElement('div'); item.className = 'chat-message';
  const head = document.createElement('div'); head.className = 'chat-message-head';
  const nick = document.createElement('strong'); nick.textContent = msg.nick;
  const time = document.createElement('time'); time.textContent = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const body = document.createElement('p'); body.textContent = msg.text;
  head.append(nick, time); item.append(head, body); box.append(item);
  while (box.children.length > 60) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
  $('chat-count').textContent = box.querySelectorAll('.chat-message').length + ' сообщений';
}
function sendChat() {
  const text = $('chat-input').value.trim();
  const nick = $('nickname').value.trim().slice(0, 24) || 'Гость';
  if (!text) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) { toast('Нет соединения с комнатой'); return; }
  send({ type: 'chat', nick, text });
  $('chat-input').value = '';
}
$('chat-send').onclick = sendChat;
$('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
$('leave').onclick = () => {
  socket?.close(); socket = null; roomId = null; currentTrack = '';
  history.replaceState({}, '', location.pathname);
  $('room').classList.add('hidden'); $('home').classList.remove('hidden');
  $('sc-player').src = 'about:blank';
  $('audio-player').pause(); $('audio-player').removeAttribute('src');
};
const invite = new URLSearchParams(location.search);
if (invite.get('room')) enter(invite.get('room'), invite.get('track') || '');
