const $ = id => document.getElementById(id);
let socket = null, roomId = null, player = null, audio = null, currentTrack = '';
const remoteSuppress = Object.create(null);
function toast(message) {
  const node = $('toast');
  if (!node) { alert(message); return; }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
}
let widgetReady = false, pendingControl = null;
function markRemote(action) {
  remoteSuppress[action] = Date.now() + 1400;
}
function consumeRemote(action) {
  const until = remoteSuppress[action] || 0;
  delete remoteSuppress[action];
  return until >= Date.now();
}
function isSoundCloud(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'soundcloud.com' || host.endsWith('.soundcloud.com');
  } catch { return false; }
}
function isDirectAudio(url) {
  try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(new URL(url).pathname); }
  catch { return false; }
}
function connect(room) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(proto + '//' + location.host);
  socket.onopen = () => send({ type: 'join', room });
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'joined') {
      if (msg.track && msg.track !== currentTrack) setTrack(msg.track, false);
      else if (!msg.track && currentTrack) send({ type: 'track', url: currentTrack });
      $('status').textContent = 'Комната синхронизирована';
      $('members').textContent = msg.count + ' в комнате';
      (msg.messages || []).forEach(renderChatMessage);
      if (msg.playback && msg.track) applyControl(msg.playback, true);
    }
    if (msg.type === 'members') $('members').textContent = msg.count + ' в комнате';
    if (msg.type === 'track') setTrack(msg.url, false);
    if (msg.type === 'control') applyControl(msg, false);
    if (msg.type === 'chat') renderChatMessage(msg);
  };
  socket.onclose = () => { $('status').textContent = 'Связь с хостом потеряна'; };
  socket.onerror = () => { $('status').textContent = 'Не удалось подключиться к серверу ПК'; };
}
function send(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function sendWidgetControl(action, position) {
  const message = { type: 'control', action };
  if (Number.isFinite(position)) message.position = Math.max(0, position);
  send(message);
}
function bindWidgetEvents(widget, url) {
  const E = SC.Widget.Events;
  widget.bind(E.READY, () => {
    if (player !== widget || currentTrack !== url) return;
    widgetReady = true;
    if (pendingControl) { const queued = pendingControl; pendingControl = null; applyControl(queued, true); }
    widget.bind(E.PLAY, () => {
      if (player !== widget || consumeRemote('play')) return;
      widget.getPosition(position => {
        if (player === widget) sendWidgetControl('play', Number(position) || 0);
      });
    });
    widget.bind(E.PAUSE, () => {
      if (player !== widget || consumeRemote('pause')) return;
      widget.getPosition(position => {
        if (player === widget) sendWidgetControl('pause', Number(position) || 0);
      });
    });
    widget.bind(E.SEEK, event => {
      if (player !== widget || consumeRemote('seek')) return;
      sendWidgetControl('seek', Number(event?.currentPosition) || 0);
    });
    widget.bind(E.ERROR, () => {
      if (player === widget) $('status').textContent = 'SoundCloud не разрешил воспроизвести этот трек.';
    });
    $('status').textContent = 'Официальный SoundCloud-плеер готов';
  });
}
function setTrack(url, announce = true) {
  currentTrack = url;
  player = null;
  audio = null;
  widgetReady = false;
  pendingControl = null;
  $('player-placeholder').classList.add('hidden');
  $('sc-player').style.display = 'none';
  $('sc-player').src = 'about:blank';
  $('audio-player').style.display = 'none';
  $('audio-player').pause();
  $('audio-player').removeAttribute('src');
  $('audio-player').load();
  $('link-player').classList.add('hidden');
  if (announce) send({ type: 'track', url });

  if (isSoundCloud(url)) {
    const frame = $('sc-player');
    frame.style.display = 'block';
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=true';
    if (!window.SC?.Widget) {
      $('status').textContent = 'Не загрузился API SoundCloud. Обновите страницу.';
      return;
    }
    const widget = SC.Widget(frame);
    player = widget;
    bindWidgetEvents(widget, url);
  } else if (isDirectAudio(url)) {
    audio = $('audio-player');
    audio.style.display = 'block';
    audio.src = url;
    audio.onplay = () => { if (!consumeRemote('play')) sendWidgetControl('play', audio.currentTime * 1000); };
    audio.onpause = () => { if (!consumeRemote('pause')) sendWidgetControl('pause', audio.currentTime * 1000); };
    audio.onseeked = () => { if (!consumeRemote('seek')) sendWidgetControl('seek', audio.currentTime * 1000); };
    audio.onerror = () => $('status').textContent = 'Аудиофайл недоступен в этом браузере.';
    audio.oncanplay = () => $('status').textContent = 'Аудиофайл готов';
  } else {
    $('link-player').classList.remove('hidden');
    $('open-track').href = url;
    $('status').textContent = 'Ссылка добавлена; общее управление этим сервисом не поддерживается.';
  }
}
function applyControl(msg, initial = false) {
  if (!['play', 'pause', 'seek'].includes(msg.action)) return;
  let position = Math.max(0, Number(msg.position) || 0);
  if (msg.action === 'play' && Number.isFinite(Number(msg.updatedAt))) {
    position += Math.max(0, Date.now() - Number(msg.updatedAt));
  }
  if (player) {
    if (!widgetReady) { pendingControl = msg; return; }
    const widget = player;
    if (msg.action === 'seek') {
      markRemote('seek');
      widget.seekTo(position);
    } else if (msg.action === 'pause') {
      markRemote('seek');
      markRemote('pause');
      if (Number.isFinite(Number(msg.position))) widget.seekTo(position);
      widget.pause();
    } else if (msg.action === 'play') {
      markRemote('seek');
      markRemote('play');
      widget.seekTo(position);
      widget.play();
    }
  } else if (audio) {
    if (msg.action === 'seek') {
      markRemote('seek');
      audio.currentTime = position / 1000;
    } else if (msg.action === 'pause') {
      markRemote('seek');
      markRemote('pause');
      if (Number.isFinite(Number(msg.position))) audio.currentTime = position / 1000;
      audio.pause();
    } else if (msg.action === 'play') {
      markRemote('seek');
      markRemote('play');
      audio.currentTime = position / 1000;
      audio.play().catch(() => toast('На этом устройстве нажмите Play: браузер блокирует удалённый запуск.'));
    }
  }
}
function inviteUrl() {
  if(location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='::1') return null;
  const u=new URL(location.href); u.searchParams.set('room',roomId); if(currentTrack)u.searchParams.set('track',currentTrack); else u.searchParams.delete('track'); return u.href;
}
function refreshInvite() {
  const url=inviteUrl();
  const field=$('invite-link');
  if(field) { field.value=url||'Открой сайт через публичную ссылку *.trycloudflare.com'; field.classList.toggle('local-warning',!url); }
}
function enter(id,track) {
  roomId=id; currentTrack=track||'';
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
  $('room-name').textContent='Комната '+id.slice(0,6).toUpperCase();
  const u=new URL(location.href); u.searchParams.set('room',id); if(track)u.searchParams.set('track',track); history.replaceState({},'',u.pathname+u.search);
  if(track)setTrack(track,false); refreshInvite(); connect(id);
}
$('create').onclick=()=>{
  const track=$('track').value.trim(); let u;
  try{u=new URL(track);}catch{}
  if(!u||!['http:','https:'].includes(u.protocol)){toast('Вставьте корректную ссылку https://');return;}
  enter(Math.random().toString(36).slice(2,10),track);
  send({type:'track',url:track});
};
$('join').onclick=()=>{const value=prompt('Вставьте ссылку-приглашение');if(!value)return;try{const u=new URL(value);const id=u.searchParams.get('room');const track=u.searchParams.get('track');if(!id)throw 0;enter(id,track||'');}catch{toast('Ссылка приглашения некорректна');}};
async function copyInvite() {
  const url=inviteUrl();
  if(!url){toast('Открой сайт через публичную HTTPS-ссылку, не через localhost');return;}
  refreshInvite();
  try {
    if(navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    } else {
      const field=$('invite-link');
      field.value=url;
      field.focus();
      field.select();
      const copied=document.execCommand('copy');
      toast(copied ? 'Ссылка скопирована' : 'Ссылка выделена — скопируй её');
    }
  } catch {
    const field=$('invite-link');
    field.focus();
    field.select();
    toast('Ссылка выделена — скопируй её');
  }
}
$('copy').onclick=copyInvite;
function renderChatMessage(msg) {
  const box=$('chat-messages');
  const empty=box.querySelector('.chat-empty'); if(empty) empty.remove();
  const item=document.createElement('div'); item.className='chat-message';
  const head=document.createElement('div'); head.className='chat-message-head';
  const nick=document.createElement('strong'); nick.textContent=msg.nick;
  const time=document.createElement('time'); time.textContent=new Date(msg.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const body=document.createElement('p'); body.textContent=msg.text;
  head.append(nick,time); item.append(head,body); box.append(item);
  while(box.children.length>60) box.firstElementChild.remove();
  box.scrollTop=box.scrollHeight;
  $('chat-count').textContent=box.querySelectorAll('.chat-message').length+' сообщений';
}
function sendChat() {
  const text=$('chat-input').value.trim();
  const nick=$('nickname').value.trim().slice(0,24)||'Гость';
  if(!text) return;
  if(!socket||socket.readyState!==WebSocket.OPEN){toast('Нет соединения с комнатой');return;}
  send({type:'chat',nick,text}); $('chat-input').value='';
}
$('chat-send').onclick=sendChat;
$('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
$('leave').onclick=()=>{socket?.close();socket=null;roomId=null;currentTrack='';history.replaceState({},'',location.pathname);$('room').classList.add('hidden');$('home').classList.remove('hidden');$('sc-player').src='about:blank';$('audio-player').pause();$('audio-player').removeAttribute('src');};
const invite=new URLSearchParams(location.search); if(invite.get('room')) enter(invite.get('room'),invite.get('track')||'');
