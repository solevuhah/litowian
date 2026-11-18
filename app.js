const $ = id => document.getElementById(id);

let supa = null;
let channel = null;
let roomId = null;
let player = null;
let audioPlayer = null;
let isApplying = false;
let currentTrack = null;
const sessionId = Math.random().toString(36).slice(2);

const cfg = () => ({
  url: localStorage.getItem('lt_sb_url'),
  key: localStorage.getItem('lt_sb_key')
});

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2400);
}

function showSettings() {
  const c = cfg();
  $('sb-url').value = c.url || '';
  $('sb-key').value = c.key || '';
  $('modal').classList.remove('hidden');
}

function connect() {
  const c = cfg();
  if (!c.url || !c.key || !window.supabase) {
    showSettings();
    return false;
  }
  supa = window.supabase.createClient(c.url, c.key);
  return true;
}

function roomFromUrl() {
  const params = new URLSearchParams(location.search);
  return { id: params.get('room'), track: params.get('track') };
}

function updateRoomUrl(id, track) {
  const url = new URL(location.href);
  url.searchParams.set('room', id);
  if (track) url.searchParams.set('track', track);
  history.replaceState({}, '', url.pathname + url.search);
}

function isSoundCloud(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'soundcloud.com' || host.endsWith('.soundcloud.com');
  } catch {
    return false;
  }
}

function makePlayer(url) {
  currentTrack = url;
  $('player-placeholder').classList.add('hidden');
  const frame = $('sc-player');
  const audio = $('audio-player');
  frame.style.display = 'none';
  frame.src = 'about:blank';
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  player = null;
  audioPlayer = null;

  if (isSoundCloud(url)) {
    frame.style.display = 'block';
    const embed = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true';
    frame.src = embed;
    frame.onload = () => {
      player = SC.Widget(frame);
      player.bind(SC.Widget.Events.READY, () => {
        player.bind(SC.Widget.Events.PLAY, () => send({ type: 'play' }));
        player.bind(SC.Widget.Events.PAUSE, () => send({ type: 'pause' }));
        player.bind(SC.Widget.Events.SEEK, () => player.getPosition(position => send({ type: 'seek', position })));
        $('status').textContent = 'SoundCloud подключён · управление общее';
      });
    };
    return;
  }

  audioPlayer = audio;
  audio.style.display = 'block';
  audio.src = url;
  audio.load();
  audio.addEventListener('play', () => send({ type: 'play' }));
  audio.addEventListener('pause', () => send({ type: 'pause' }));
  audio.addEventListener('seeked', () => {
    if (!isApplying && Number.isFinite(audio.currentTime)) {
      send({ type: 'seek', position: audio.currentTime * 1000 });
    }
  });
  audio.addEventListener('canplay', () => {
    $('status').textContent = 'Аудиофайл готов · управление общее';
  }, { once: true });
  audio.addEventListener('error', () => {
    $('status').textContent = 'Не удалось загрузить аудио. Нужна прямая ссылка на доступный аудиофайл.';
  }, { once: true });
}

function send(payload) {
  if (!channel || isApplying) return;
  channel.send({
    type: 'broadcast',
    event: 'control',
    payload: { ...payload, by: sessionId, at: Date.now() }
  });
}

async function enterRoom(id, track) {
  if (!connect()) return;
  if (channel) {
    await supa.removeChannel(channel);
    channel = null;
  }
  roomId = id;
  currentTrack = track || currentTrack;
  updateRoomUrl(id, currentTrack);
  $('home').classList.add('hidden');
  $('room').classList.remove('hidden');
  $('room-name').textContent = 'Комната ' + id.slice(0, 6).toUpperCase();

  if (currentTrack) {
    $('track').value = currentTrack;
    makePlayer(currentTrack);
  } else {
    $('player-placeholder').classList.remove('hidden');
    $('player-placeholder').querySelector('p').textContent = 'В приглашении нет источника музыки. Попросите создателя отправить новую ссылку.';
    $('sc-player').style.display = 'none';
    $('audio-player').style.display = 'none';
    $('status').textContent = 'Ожидается ссылка на музыку';
  }

  channel = supa.channel('litowian-' + id, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'control' }, ({ payload }) => {
    if (payload.by === sessionId) return;
    const soundCloudReady = player;
    const audioReady = audioPlayer;
    if (!soundCloudReady && !audioReady) return;
    isApplying = true;
    if (payload.type === 'play') {
      if (soundCloudReady) player.play();
      if (audioReady) audioPlayer.play().catch(() => {
        $('status').textContent = 'Нажмите Play, чтобы разрешить воспроизведение в этом браузере.';
      });
    }
    if (payload.type === 'pause') {
      if (soundCloudReady) player.pause();
      if (audioReady) audioPlayer.pause();
    }
    if (payload.type === 'seek' && Number.isFinite(payload.position)) {
      if (soundCloudReady) player.seekTo(payload.position);
      if (audioReady) audioPlayer.currentTime = Math.max(0, payload.position / 1000);
    }
    setTimeout(() => { isApplying = false; }, 900);
  });
  channel.subscribe(status => {
    $('status').textContent = status === 'SUBSCRIBED'
      ? 'Комната синхронизирована · отправь ссылку другу'
      : 'Подключение к комнате…';
  });
}

$('settings').onclick = showSettings;
$('close').onclick = () => $('modal').classList.add('hidden');

$('save').onclick = async () => {
  const url = $('sb-url').value.trim();
  const key = $('sb-key').value.trim();
  if (!url.startsWith('https://') || !key) {
    toast('Проверьте URL и ключ Supabase');
    return;
  }
  localStorage.setItem('lt_sb_url', url);
  localStorage.setItem('lt_sb_key', key);
  $('modal').classList.add('hidden');
  toast('Настройки сохранены');
  if (roomId) await enterRoom(roomId, currentTrack);
};

$('create').onclick = async () => {
  const track = $('track').value.trim();
  let parsed;
  try { parsed = new URL(track); } catch {}
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) ||
      (!isSoundCloud(track) && !/\.(mp3|m4a|aac|ogg|oga|wav|flac)(\?|#|$)/i.test(parsed.pathname + parsed.search))) {
    toast('Вставьте SoundCloud или прямую ссылку на аудиофайл');
    return;
  }
  if (!connect()) return;
  await enterRoom(Math.random().toString(36).slice(2, 10), track);
};

$('join').onclick = async () => {
  const value = prompt('Вставьте ссылку-приглашение от создателя комнаты');
  if (!value) return;
  try {
    const url = new URL(value.trim());
    const id = url.searchParams.get('room');
    const track = url.searchParams.get('track');
    if (!id || !track) throw new Error('missing invite details');
    await enterRoom(id, track);
  } catch {
    toast('Нужна полная ссылка-приглашение, а не только код');
  }
};

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Ссылка скопирована — отправьте другу');
  } catch {
    toast('Скопируйте ссылку из адресной строки');
  }
};

$('leave').onclick = async () => {
  if (channel && supa) await supa.removeChannel(channel);
  channel = null;
  roomId = null;
  currentTrack = null;
  player = null;
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.removeAttribute('src');
    audioPlayer.load();
  }
  audioPlayer = null;
  history.replaceState({}, '', location.pathname);
  $('room').classList.add('hidden');
  $('home').classList.remove('hidden');
  $('sc-player').style.display = 'none';
  $('sc-player').src = 'about:blank';
  $('audio-player').style.display = 'none';
  $('player-placeholder').classList.remove('hidden');
};

const invite = roomFromUrl();
if (invite.id) {
  if (invite.track) enterRoom(invite.id, invite.track);
  else showSettings();
}
