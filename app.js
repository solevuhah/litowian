const $ = id => document.getElementById(id);
let socket = null, roomId = null, player = null, audio = null, applying = false, currentTrack = '';
const sessionId = Math.random().toString(36).slice(2);
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2400); }
function isSoundCloud(url) { try { const h=new URL(url).hostname.toLowerCase(); return h==='soundcloud.com'||h.endsWith('.soundcloud.com'); } catch { return false; } }
function isDirectAudio(url) { try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(new URL(url).pathname); } catch { return false; } }
function connect(room) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(proto+'//'+location.host);
  socket.onopen = () => socket.send(JSON.stringify({type:'join',room}));
  socket.onmessage = event => {
    const msg=JSON.parse(event.data);
    if(msg.type==='joined') { if(msg.track && !currentTrack) setTrack(msg.track,false); $('status').textContent='Комната синхронизирована'; $('members').textContent=msg.count+' в комнате'; }
    if(msg.type==='members') $('members').textContent=msg.count+' в комнате';
    if(msg.type==='track') setTrack(msg.url,false);
    if(msg.type==='control') applyControl(msg);
  };
  socket.onclose=()=>{ $('status').textContent='Связь с хостом потеряна'; };
  socket.onerror=()=>{ $('status').textContent='Не удалось подключиться к серверу ПК'; };
}
function send(data) { if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify(data)); }
function setTrack(url, announce=true) {
  currentTrack=url; player=null; audio=null;
  $('player-placeholder').classList.add('hidden'); $('sc-player').style.display='none'; $('sc-player').src='about:blank';
  $('audio-player').style.display='none'; $('audio-player').pause(); $('audio-player').removeAttribute('src'); $('audio-player').load();
  $('link-player').classList.add('hidden');
  if(announce) send({type:'track',url});
  if(isSoundCloud(url)) {
    const frame=$('sc-player'); frame.style.display='block';
    frame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(url)+'&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=true';
    frame.onload=()=>{ player=SC.Widget(frame); player.bind(SC.Widget.Events.READY,()=>{ player.bind(SC.Widget.Events.PLAY,()=>{if(!applying)send({type:'control',action:'play'});}); player.bind(SC.Widget.Events.PAUSE,()=>{if(!applying)send({type:'control',action:'pause'});}); player.bind(SC.Widget.Events.SEEK,()=>player.getPosition(p=>{if(!applying)send({type:'control',action:'seek',position:p});})); $('status').textContent='SoundCloud плеер готов'; }); };
  } else if(isDirectAudio(url)) {
    audio=$('audio-player'); audio.style.display='block'; audio.src=url;
    audio.onplay=()=>{if(!applying)send({type:'control',action:'play'});};
    audio.onpause=()=>{if(!applying)send({type:'control',action:'pause'});};
    audio.onseeked=()=>{if(!applying)send({type:'control',action:'seek',position:audio.currentTime*1000});};
    audio.onerror=()=>$('status').textContent='Аудиофайл недоступен в этом браузере.';
    audio.oncanplay=()=>$('status').textContent='Аудиофайл готов';
  } else {
    $('link-player').classList.remove('hidden'); $('open-track').href=url;
    $('status').textContent='Ссылка добавлена; общее управление этим сервисом не поддерживается.';
  }
}
function applyControl(msg) {
  applying=true;
  if(player) {
    if(msg.action==='play') player.play();
    if(msg.action==='pause') player.pause();
    if(msg.action==='seek') player.seekTo(msg.position);
  }
  if(audio) {
    if(msg.action==='play') audio.play().catch(()=>toast('Нажмите Play, чтобы разрешить воспроизведение.'));
    if(msg.action==='pause') audio.pause();
    if(msg.action==='seek') audio.currentTime=msg.position/1000;
  }
  setTimeout(()=>applying=false,700);
}
function enter(id,track) {
  roomId=id; currentTrack=track||'';
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
  $('room-name').textContent='Комната '+id.slice(0,6).toUpperCase();
  const u=new URL(location.href); u.searchParams.set('room',id); if(track)u.searchParams.set('track',track); history.replaceState({},'',u.pathname+u.search);
  if(track)setTrack(track,false); connect(id);
}
$('create').onclick=()=>{
  const track=$('track').value.trim(); let u;
  try{u=new URL(track);}catch{}
  if(!u||!['http:','https:'].includes(u.protocol)){toast('Вставьте корректную ссылку https://');return;}
  enter(Math.random().toString(36).slice(2,10),track);
  send({type:'track',url:track});
};
$('join').onclick=()=>{const value=prompt('Вставьте ссылку-приглашение');if(!value)return;try{const u=new URL(value);const id=u.searchParams.get('room');const track=u.searchParams.get('track');if(!id)throw 0;enter(id,track||'');}catch{toast('Ссылка приглашения некорректна');}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Ссылка скопирована');}catch{toast('Скопируйте адресную строку');}};
$('leave').onclick=()=>{socket?.close();socket=null;roomId=null;currentTrack='';history.replaceState({},'',location.pathname);$('room').classList.add('hidden');$('home').classList.remove('hidden');$('sc-player').src='about:blank';$('audio-player').pause();$('audio-player').removeAttribute('src');};
const invite=new URLSearchParams(location.search); if(invite.get('room')) enter(invite.get('room'),invite.get('track')||'');
