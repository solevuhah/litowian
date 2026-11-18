const $ = id => document.getElementById(id);
let socket = null, roomId = null, player = null, audio = null, currentTrack = '', playbackPoll = null;
let lastPausedState = null, expectedRemotePaused = null, widgetPollBusy = false;
const suppressEcho = Object.create(null);
function stopPlaybackPoll() { if(playbackPoll) clearInterval(playbackPoll); playbackPoll=null; lastPausedState=null; expectedRemotePaused=null; widgetPollBusy=false; }
function markRemote(action) { suppressEcho[action] = Date.now() + 1800; }
function isRemoteEcho(action) { if ((suppressEcho[action] || 0) > Date.now()) { delete suppressEcho[action]; return true; } delete suppressEcho[action]; return false; }
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2400); }
function isSoundCloud(url) { try { const h=new URL(url).hostname.toLowerCase(); return h==='soundcloud.com'||h.endsWith('.soundcloud.com'); } catch { return false; } }
function isDirectAudio(url) { try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(new URL(url).pathname); } catch { return false; } }
function connect(room) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(proto+'//'+location.host);
  socket.onopen = () => { socket.send(JSON.stringify({type:'join',room})); if(currentTrack) socket.send(JSON.stringify({type:'track',url:currentTrack})); };
  socket.onmessage = event => {
    const msg=JSON.parse(event.data);
    if(msg.type==='joined') {
      if(msg.track && !currentTrack) setTrack(msg.track,false);
      $('status').textContent='Комната синхронизирована';
      $('members').textContent=msg.count+' в комнате';
      (msg.messages||[]).forEach(renderChatMessage);
    }
    if(msg.type==='members') $('members').textContent=msg.count+' в комнате';
    if(msg.type==='track') setTrack(msg.url,false);
    if(msg.type==='control') applyControl(msg);
    if(msg.type==='chat') renderChatMessage(msg);
  };
  socket.onclose=()=>{ $('status').textContent='Связь с хостом потеряна'; };
  socket.onerror=()=>{ $('status').textContent='Не удалось подключиться к серверу ПК'; };
}
function send(data) { if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify(data)); }
function setTrack(url, announce=true) {
  stopPlaybackPoll(); currentTrack=url; player=null; audio=null;
  $('player-placeholder').classList.add('hidden'); $('sc-player').style.display='none'; $('sc-player').src='about:blank';
  $('audio-player').style.display='none'; $('audio-player').pause(); $('audio-player').removeAttribute('src'); $('audio-player').load();
  $('link-player').classList.add('hidden');
  if(announce) send({type:'track',url});
  if(isSoundCloud(url)) {
    const frame=$('sc-player'); frame.style.display='block';
    frame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(url)+'&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=true';
    frame.onload=()=>{
      const widget=SC.Widget(frame);
      player=widget;
      widget.bind(SC.Widget.Events.READY,()=>{
        if(player!==widget) return;
        widget.bind(SC.Widget.Events.SEEK,event=>{
          if(!isRemoteEcho('seek')) send({type:'control',action:'seek',position:event?.currentPosition||0});
        });
        widget.isPaused(paused=>{
          if(player!==widget) return;
          lastPausedState=!!paused;
          playbackPoll=setInterval(()=>{
            if(player!==widget || widgetPollBusy) return;
            widgetPollBusy=true;
            widget.isPaused(nowPaused=>{
              widgetPollBusy=false;
              if(player!==widget) return;
              nowPaused=!!nowPaused;
              if(lastPausedState===null){lastPausedState=nowPaused;return;}
              if(nowPaused===lastPausedState) return;
              lastPausedState=nowPaused;
              if(expectedRemotePaused && nowPaused===expectedRemotePaused.state && Date.now()<=expectedRemotePaused.expires){
                expectedRemotePaused=null;
                return;
              }
              if(expectedRemotePaused && Date.now()>expectedRemotePaused.expires) expectedRemotePaused=null;
              send({type:'control',action:nowPaused?'pause':'play'});
            });
          },300);
        });
        $('status').textContent='SoundCloud плеер готов';
      });
    };
    frame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(url)+'&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=true';
  } else if(isDirectAudio(url)) {
    audio=$('audio-player'); audio.style.display='block'; audio.src=url;
    audio.onplay=()=>{if(!isRemoteEcho('play'))send({type:'control',action:'play'});};
    audio.onpause=()=>{if(!isRemoteEcho('pause'))send({type:'control',action:'pause'});};
    audio.onseeked=()=>{if(!isRemoteEcho('seek'))send({type:'control',action:'seek',position:audio.currentTime*1000});};
    audio.onerror=()=>$('status').textContent='Аудиофайл недоступен в этом браузере.';
    audio.oncanplay=()=>$('status').textContent='Аудиофайл готов';
  } else {
    $('link-player').classList.remove('hidden'); $('open-track').href=url;
    $('status').textContent='Ссылка добавлена; общее управление этим сервисом не поддерживается.';
  }
}
function applyControl(msg) {
  if(!['play','pause','seek'].includes(msg.action)) return;
  if(player) {
    if(msg.action==='play' || msg.action==='pause') expectedRemotePaused={state:msg.action==='pause',expires:Date.now()+2500};
    if(msg.action==='play') player.play();
    if(msg.action==='pause') player.pause();
    if(msg.action==='seek') player.seekTo(Math.max(0,Number(msg.position)||0));
  }
  if(audio) {
    if(msg.action==='play' || msg.action==='pause') markRemote(msg.action);
    if(msg.action==='play') audio.play().catch(()=>toast('Нажмите Play, чтобы разрешить воспроизведение.'));
    if(msg.action==='pause') audio.pause();
    if(msg.action==='seek') audio.currentTime=Math.max(0,Number(msg.position)||0)/1000;
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
async function shareInvite() {
  const url=inviteUrl();
  if(!url){toast('Открой комнату по публичной HTTPS-ссылке, не через localhost');return;}
  refreshInvite();
  if(navigator.share) {
    try { await navigator.share({title:'Приглашение в litowian',text:'Заходи слушать музыку вместе:',url}); return; }
    catch(e) { if(e.name==='AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — вставь её в чат'); }
  catch { $('invite-link').focus(); $('invite-link').select(); toast('Ссылка выделена — скопируй и отправь в чат'); }
}
$('copy').onclick=shareInvite;
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
