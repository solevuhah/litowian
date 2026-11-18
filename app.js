const $ = id => document.getElementById(id);
let socket = null, roomId = null, player = null, audio = null, currentTrack = '';
let trackDuration = 0, currentPosition = 0, draggingProgress = false, isPlaying = false;
let pendingPlayback = null;
const remoteEcho = Object.create(null);

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2600);
}
function status(message) { $('status').textContent = message; }
function isSoundCloud(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'soundcloud.com' || h.endsWith('.soundcloud.com'); }
  catch { return false; }
}
function isDirectAudio(url) {
  try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(new URL(url).pathname); }
  catch { return false; }
}
function markRemote(action) { remoteEcho[action] = Date.now() + 1800; }
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
    send({ type: 'join', room });
  };
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'joined') {
      if (msg.track && msg.track !== currentTrack) setTrack(msg.track, false);
      else if (!msg.track && currentTrack) send({ type: 'track', url: currentTrack });
      status('Комната синхронизирована');
      $('members').textContent = msg.count + ' в комнате';
      (msg.messages || []).forEach(renderChatMessage);
      if (msg.playback && msg.playback.action) applyControl(msg.playback, true);
    }
    if (msg.type === 'members') $('members').textContent = msg.count + ' в комнате';
    if (msg.type === 'track') setTrack(msg.url, false);
    if (msg.type === 'control') applyControl(msg, true);
    if (msg.type === 'chat') renderChatMessage(msg);
  };
  socket.onclose = () => status('Связь с хостом потеряна');
  socket.onerror = () => status('Не удалось подключиться к серверу ПК');
}
function formatTime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
function updateProgress(position, duration) {
  if (Number.isFinite(duration) && duration > 0) trackDuration = duration;
  if (Number.isFinite(position) && position >= 0) currentPosition = position;
  if (!draggingProgress) $('progress').value = String(Math.min(1000, currentPosition / (trackDuration || 1) * 1000));
  $('elapsed').textContent = formatTime(currentPosition);
  $('duration').textContent = formatTime(trackDuration);
}
function setTrackInfo(sound) {
  if (!sound) return;
  $('track-title').textContent = sound.title || 'Без названия';
  $('track-artist').textContent = sound.user?.username || 'SoundCloud';
  const art = sound.artwork_url || sound.user?.avatar_url;
  if (art) $('track-art').src = art.replace('-large.', '-t500x500.');
  else $('track-art').removeAttribute('src');
  if (sound.permalink_url) $('soundcloud-source').href = sound.permalink_url;
  if (sound.duration) updateProgress(0, sound.duration);
}
function sendPlayback(action, position) {
  const data = { type: 'control', action };
  if (Number.isFinite(position)) data.position = Math.max(0, position);
  send(data);
}
function setTrack(url, announce = true) {
  currentTrack = url;
  player = null;
  audio = null;
  pendingPlayback = null;
  trackDuration = 0;
  currentPosition = 0;
  isPlaying = false;
  $('player-placeholder').classList.add('hidden');
  $('link-player').classList.add('hidden');
  $('custom-player').classList.add('hidden');
  const frame = $('sc-player');
  frame.src = 'about:blank';
  const oldAudio = $('audio-player');
  oldAudio.pause();
  oldAudio.removeAttribute('src');
  oldAudio.load();
  $('track-title').textContent = 'Загрузка трека…';
  $('track-artist').textContent = '';
  $('track-art').removeAttribute('src');
  $('play-toggle').textContent = '▶';
  updateProgress(0, 0);
  if (announce) send({ type: 'track', url });

  if (isSoundCloud(url)) {
    $('custom-player').classList.remove('hidden');
    status('Загружаем официальный SoundCloud-плеер…');
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=false&buying=false&sharing=false&download=false';

    // Attach the Widget API immediately after setting src. Waiting for iframe.onload
    // can miss the widget READY message on some browsers.
    if (!window.SC?.Widget) {
      status('Не загрузился API SoundCloud. Проверьте подключение к интернету.');
      return;
    }
    const widget = SC.Widget(frame);
    player = widget;
    widget.bind(SC.Widget.Events.READY, () => {
      if (player !== widget || currentTrack !== url) return;
      widget.bind(SC.Widget.Events.ERROR, () => {
        if (player === widget) status('SoundCloud не разрешил воспроизвести этот трек.');
      });
      widget.bind(SC.Widget.Events.PLAY, () => {
        if (player !== widget) return;
        isPlaying = true;
        $('play-toggle').textContent = 'Ⅱ';
        if (!consumeRemote('play')) widget.getPosition(pos => sendPlayback('play', Number(pos) || 0));
      });
      widget.bind(SC.Widget.Events.PAUSE, () => {
        if (player !== widget) return;
        isPlaying = false;
        $('play-toggle').textContent = '▶';
        if (!consumeRemote('pause')) widget.getPosition(pos => sendPlayback('pause', Number(pos) || 0));
      });
      widget.bind(SC.Widget.Events.PLAY_PROGRESS, event => {
        if (player === widget && event) updateProgress(event.currentPosition, trackDuration);
      });
      widget.bind(SC.Widget.Events.SEEK, event => {
        if (player !== widget) return;
        const pos = Number(event?.currentPosition) || 0;
        updateProgress(pos, trackDuration);
        if (!consumeRemote('seek')) sendPlayback('seek', pos);
      });
      widget.bind(SC.Widget.Events.FINISH, () => {
        if (player === widget) { isPlaying = false; $('play-toggle').textContent = '▶'; }
      });
      widget.getCurrentSound(setTrackInfo);
      widget.getDuration(duration => { if (player === widget) updateProgress(currentPosition, duration); });
      widget.getPosition(position => { if (player === widget) updateProgress(position, trackDuration); });
      status('SoundCloud готов. Нажмите Play для начала.');
      if (pendingPlayback) {
        const queued = pendingPlayback;
        pendingPlayback = null;
        applyControl(queued, false);
      }
    });
  } else if (isDirectAudio(url)) {
    $('custom-player').classList.remove('hidden');
    audio = oldAudio;
    audio.src = url;
    try { $('track-title').textContent = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Аудиофайл'); }
    catch { $('track-title').textContent = 'Аудиофайл'; }
    $('track-artist').textContent = 'Прямой аудиофайл';
    audio.onloadedmetadata = () => updateProgress(0, audio.duration * 1000);
    audio.ontimeupdate = () => updateProgress(audio.currentTime * 1000, audio.duration * 1000);
    audio.onplay = () => { isPlaying = true; $('play-toggle').textContent = 'Ⅱ'; if (!consumeRemote('play')) sendPlayback('play', audio.currentTime * 1000); };
    audio.onpause = () => { isPlaying = false; $('play-toggle').textContent = '▶'; if (!consumeRemote('pause')) sendPlayback('pause', audio.currentTime * 1000); };
    audio.onseeked = () => { if (!consumeRemote('seek')) sendPlayback('seek', audio.currentTime * 1000); };
    audio.onerror = () => status('Аудиофайл недоступен или запрещён сервером.');
    status('Аудиофайл загружается…');
  } else {
    $('link-player').classList.remove('hidden');
    $('open-track').href = url;
    status('Эта ссылка не является поддерживаемым аудиотреком.');
  }
}
function applyControl(msg, fromServer = false) {
  if (!['play', 'pause', 'seek'].includes(msg.action)) return;
  if (!player && !audio) {
    pendingPlayback = msg;
    return;
  }
  let position = Math.max(0, Number(msg.position) || 0);
  if (msg.action === 'play' && Number.isFinite(Number(msg.updatedAt))) {
    position += Math.max(0, Date.now() - Number(msg.updatedAt));
  }
  if (player) {
    if (msg.action === 'seek') {
      markRemote('seek');
      player.seekTo(position);
    } else if (msg.action === 'pause') {
      markRemote('pause');
      if (Number.isFinite(Number(msg.position))) player.seekTo(position);
      player.pause();
      isPlaying = false;
      $('play-toggle').textContent = '▶';
    } else if (msg.action === 'play') {
      markRemote('play');
      player.seekTo(position);
      player.play();
    }
  } else if (audio) {
    if (msg.action === 'seek') {
      markRemote('seek');
      audio.currentTime = position / 1000;
    } else if (msg.action === 'pause') {
      markRemote('pause');
      if (Number.isFinite(Number(msg.position))) audio.currentTime = position / 1000;
      audio.pause();
    } else if (msg.action === 'play') {
      markRemote('play');
      audio.currentTime = position / 1000;
      audio.play().catch(() => toast('На этом устройстве нажмите Play один раз: браузер блокирует удалённый автозапуск.'));
    }
  }
}
function togglePlayback() {
  if (player) {
    if (isPlaying) player.pause();
    else player.play();
  } else if (audio) {
    if (audio.paused) audio.play().catch(() => toast('Браузер не разрешил воспроизведение.'));
    else audio.pause();
  }
}
function seekToPosition(position) {
  const target = Math.max(0, Math.min(trackDuration || Infinity, position));
  markRemote('seek');
  if (player) player.seekTo(target);
  else if (audio) audio.currentTime = target / 1000;
  sendPlayback('seek', target);
}
function seekBy(delta) {
  if (player) player.getPosition(pos => seekToPosition((Number(pos) || 0) + delta));
  else if (audio) seekToPosition(audio.currentTime * 1000 + delta);
}
$('play-toggle').onclick = togglePlayback;
$('backward').onclick = () => seekBy(-10000);
$('forward').onclick = () => seekBy(10000);
$('progress').addEventListener('input', () => {
  draggingProgress = true;
  $('elapsed').textContent = formatTime(Number($('progress').value) / 1000 * trackDuration);
});
$('progress').addEventListener('change', () => {
  const position = Number($('progress').value) / 1000 * trackDuration;
  draggingProgress = false;
  seekToPosition(position);
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
