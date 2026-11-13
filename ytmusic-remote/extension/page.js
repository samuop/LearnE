// Corre dentro de la página de YouTube Music (mundo MAIN) para poder usar el reproductor.
// Se comunica con content.js por window.postMessage.
(() => {
  if (window.__ytmRemote) return;
  window.__ytmRemote = true;

  const $ = (s) => document.querySelector(s);
  const player = () => document.getElementById('movie_player');
  const video = () => $('video');

  function clickFirst(selectors) {
    for (const s of selectors) {
      const el = $(s);
      if (el) { (el.querySelector('button') || el).click(); return true; }
    }
    return false;
  }

  const SEL = {
    playPause: ['ytmusic-player-bar #play-pause-button', '#play-pause-button'],
    next: ['ytmusic-player-bar .next-button'],
    prev: ['ytmusic-player-bar .previous-button'],
    like: ['ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like', 'ytmusic-player-bar ytmusic-like-button-renderer .like'],
    dislike: ['ytmusic-player-bar ytmusic-like-button-renderer #button-shape-dislike', 'ytmusic-player-bar ytmusic-like-button-renderer .dislike'],
    shuffle: ['ytmusic-player-bar .shuffle'],
    repeat: ['ytmusic-player-bar .repeat'],
  };

  function bestArtwork(md) {
    const list = md && md.artwork ? [...md.artwork] : [];
    if (!list.length) return $('ytmusic-player-bar img.image')?.src || '';
    const size = (a) => parseInt(String(a.sizes || '0').split('x')[0], 10) || 0;
    list.sort((a, b) => size(b) - size(a));
    return list[0].src;
  }

  function readState() {
    const p = player();
    const v = video();
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const bar = $('ytmusic-player-bar');
    const title = (md && md.title) || $('ytmusic-player-bar .title')?.textContent?.trim() || '';
    const playing = v ? !v.paused && !v.ended : p?.getPlayerState?.() === 1;
    const duration = v && Number.isFinite(v.duration) ? v.duration : (p?.getDuration?.() || 0);
    return {
      hasTrack: !!title,
      title,
      artist: (md && md.artist) || '',
      album: (md && md.album) || '',
      artwork: bestArtwork(md),
      playing,
      currentTime: v ? v.currentTime : (p?.getCurrentTime?.() || 0),
      duration,
      volume: p?.getVolume ? p.getVolume() : Math.round((v ? v.volume : 1) * 100),
      muted: p?.isMuted ? p.isMuted() : !!(v && v.muted),
      likeStatus: $('ytmusic-player-bar ytmusic-like-button-renderer')?.getAttribute('like-status') || 'INDIFFERENT',
      repeat: bar?.getAttribute('repeat-mode') || 'NONE',
      shuffle: bar ? bar.hasAttribute('shuffle-on') : false,
      ts: Date.now(),
    };
  }

  function push() {
    try { window.postMessage({ src: 'ytmr-page', type: 'state', state: readState() }, location.origin); } catch {}
  }

  function run(action, value) {
    const p = player();
    const v = video();
    switch (action) {
      case 'toggle':
        if (!clickFirst(SEL.playPause) && v) v.paused ? v.play() : v.pause();
        break;
      case 'play':
        if (v && v.paused) run('toggle');
        break;
      case 'pause':
        if (v && !v.paused) run('toggle');
        break;
      case 'next':
        if (!clickFirst(SEL.next)) p?.nextVideo?.();
        break;
      case 'prev':
        if (!clickFirst(SEL.prev)) p?.previousVideo?.();
        break;
      case 'seek': {
        const t = Math.max(0, Number(value) || 0);
        if (p?.seekTo) p.seekTo(t, true);
        else if (v) v.currentTime = t;
        break;
      }
      case 'volume': {
        const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        if (p?.setVolume) {
          p.setVolume(n);
          if (n > 0 && p.isMuted?.()) p.unMute();
        } else if (v) {
          v.volume = n / 100;
        }
        const slider = $('ytmusic-player-bar #volume-slider');
        if (slider) slider.value = n; // mantiene sincronizada la barra de volumen de YT Music
        break;
      }
      case 'mute':
        if (p?.isMuted) p.isMuted() ? p.unMute() : p.mute();
        else if (v) v.muted = !v.muted;
        break;
      case 'like':
        clickFirst(SEL.like);
        break;
      case 'dislike':
        clickFirst(SEL.dislike);
        break;
      case 'shuffle':
        clickFirst(SEL.shuffle);
        break;
      case 'repeat':
        clickFirst(SEL.repeat);
        break;
    }
    setTimeout(push, 150);
    setTimeout(push, 600);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.src !== 'ytmr-cs') return;
    if (e.data.type === 'cmd') run(e.data.action, e.data.value);
    else if (e.data.type === 'ping') push();
  });

  // Los eventos de <video> no burbujean, pero sí se capturan en el documento.
  for (const ev of ['play', 'pause', 'seeked', 'volumechange', 'loadedmetadata', 'ended']) {
    document.addEventListener(ev, push, true);
  }
  setInterval(push, 1000);
  push();
})();
