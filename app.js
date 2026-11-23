(() => {
  const modes = ['CutIn', 'FadeIn', 'Overlay'];
  const FADE_DURATION_MS = 5000;
  const icons = ['♫', '✦', '◉', '⚡', '♪', '✳', '◇', '☼', '✧', '◌'];
  const colors = ['#c8f179', '#f1a274', '#89d9ce', '#d39df0', '#efd06f', '#8bb7f3', '#f08fac', '#9bd88c', '#e6aa67', '#9dc6d1'];
  const numpadCodes = Array.from({ length: 10 }, (_, index) => `Numpad${(index + 1) % 10}`);
  const grid = document.querySelector('#sound-grid');
  const emptyState = document.querySelector('#empty-state');
  const toast = document.querySelector('#toast');
  const outputSelect = document.querySelector('#audio-output');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const outputSupported = Boolean(window.isSecureContext && navigator.mediaDevices?.enumerateDevices && AudioContextClass?.prototype.setSinkId && HTMLMediaElement.prototype.setSinkId);
  let selectedOutput = '';
  let outputTask = Promise.resolve();
  const players = new Map();
  const pendingPlayers = new Map();
  const audioUrls = new Map();
  const resumePositions = new Map();
  const iconUrls = [];
  const keyBindings = loadObject('soundboard-key-bindings');
  const selectedModes = loadObject('soundboard-selected-modes');
  let store;
  let audioContext = null;
  let boardEntries = [];
  let toastTimer;
  let listeningEntry = null;
  let playbackSequence = 0;

  function loadObject(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }
  function saveObject(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function notify(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }
  async function listOutputs(extraDevice) {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default');
    if (extraDevice && !devices.some((device) => device.deviceId === extraDevice.deviceId)) devices.push(extraDevice);
    outputSelect.replaceChildren(new Option('System default', ''));
    devices.forEach((device, index) => outputSelect.add(new Option(device.label || `Output ${index + 1}`, device.deviceId)));
    outputSelect.add(new Option('Choose device…', '__choose__'));
    outputSelect.value = selectedOutput;
    return devices;
  }
  async function applyOutput(deviceId) {
    const context = wakeAudioContext();
    if (!context) throw new Error('Audio output is unavailable');
    const previous = selectedOutput;
    const fallbackPlayers = [...players.values()].filter((player) => !player.gainNode);
    try {
      await context.setSinkId(deviceId);
      for (const player of fallbackPlayers) await player.audio.setSinkId(deviceId);
    } catch (error) {
      await context.setSinkId(previous).catch(() => {});
      await Promise.allSettled(fallbackPlayers.map((player) => player.audio.setSinkId(previous)));
      throw error;
    }
    selectedOutput = deviceId;
    try { localStorage.setItem('soundboard-audio-output', deviceId); } catch {}
    outputSelect.value = deviceId;
  }
  if (outputSupported) {
    outputSelect.disabled = true;
    outputTask = (async () => {
      const devices = await listOutputs();
      let saved;
      try { saved = localStorage.getItem('soundboard-audio-output'); } catch {}
      if (saved && devices.some((device) => device.deviceId === saved)) {
        selectedOutput = saved;
        outputSelect.value = saved;
      }
    })().catch(() => notify('Could not list audio outputs')).finally(() => { outputSelect.disabled = false; });
    outputSelect.addEventListener('change', () => {
      const requested = outputSelect.value;
      wakeAudioContext();
      outputSelect.disabled = true;
      outputTask = (async () => {
        let deviceId = requested;
        if (requested === '__choose__') {
          if (navigator.mediaDevices.selectAudioOutput) {
            const device = await navigator.mediaDevices.selectAudioOutput();
            deviceId = device.deviceId;
            await listOutputs(device);
          } else {
            // Chromium uses microphone permission to expose output devices.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            await listOutputs();
            notify('Choose an audio output from the list');
            return;
          }
        }
        await applyOutput(deviceId);
        notify('Audio output updated');
      })().catch((error) => {
        notify(error.name === 'NotAllowedError' ? 'Device access was not allowed' : 'Could not switch audio output');
      }).finally(() => {
        outputSelect.value = selectedOutput;
        outputSelect.disabled = false;
      });
    });
    navigator.mediaDevices.addEventListener('devicechange', () => {
      outputTask = outputTask.then(async () => {
        const devices = await listOutputs();
        if (selectedOutput && !devices.some((device) => device.deviceId === selectedOutput)) {
          await applyOutput('');
          notify('Audio output disconnected; using system default');
        }
      }).catch(() => notify('Could not refresh audio outputs'));
    });
  } else {
    outputSelect.disabled = true;
    outputSelect.options[0].textContent = 'System default only';
    outputSelect.title = 'Output selection needs a supported browser such as Chrome or Edge, on HTTPS or localhost.';
  }
  function keyLabel(code) {
    return `Num ${code.replace('Numpad', '')}`;
  }
  function showKeyBinding(id) {
    const button = grid.querySelector(`[data-entry="${CSS.escape(id)}"] .key-binding`);
    if (!button) return;
    const code = keyBindings[id];
    button.textContent = listeningEntry === id ? 'Press key…' : keyLabel(code);
    button.classList.toggle('is-listening', listeningEntry === id);
    button.setAttribute('aria-label', listeningEntry === id ? 'Press a number pad key' : `Change key binding, currently ${keyLabel(code)}`);
  }
  function assignDefaultKeys(entries) {
    const used = new Set();
    let changed = false;
    entries.forEach((entry, index) => {
      let code = keyBindings[entry.id];
      if (!/^Numpad[0-9]$/.test(code || '') || used.has(code)) {
        code = numpadCodes.find((candidate) => !used.has(candidate)) || numpadCodes[index % numpadCodes.length];
        keyBindings[entry.id] = code;
        changed = true;
      }
      used.add(code);
    });
    if (changed) saveObject('soundboard-key-bindings', keyBindings);
  }
  function setSelectedMode(id, mode) {
    selectedModes[id] = mode;
    saveObject('soundboard-selected-modes', selectedModes);
    const card = grid.querySelector(`[data-entry="${CSS.escape(id)}"]`);
    if (!card) return;
    card.querySelectorAll('.card-actions button').forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function makeCard(entry, index) {
    const id = entry.id;
    const card = document.createElement('article');
    card.className = 'sound-card';
    card.dataset.entry = id;
    card.style.setProperty('--slot-color', colors[index % colors.length]);

    const top = document.createElement('div');
    top.className = 'card-top';
    const icon = document.createElement('div');
    icon.className = 'slot-icon';
    icon.setAttribute('aria-hidden', 'true');
    if (entry.iconBlob) {
      const image = document.createElement('img');
      const url = URL.createObjectURL(entry.iconBlob);
      iconUrls.push(url);
      image.src = url;
      image.alt = '';
      icon.append(image);
    } else {
      icon.textContent = icons[index % icons.length];
    }
    const copy = document.createElement('div');
    copy.className = 'slot-copy';
    const title = document.createElement('h2');
    title.textContent = entry.title || entry.name || `Sound ${index + 1}`;
    copy.append(title);

    const tools = document.createElement('div');
    tools.className = 'card-tools';
    const keyButton = document.createElement('button');
    keyButton.type = 'button';
    keyButton.className = 'key-binding';
    keyButton.textContent = keyLabel(keyBindings[id]);
    keyButton.setAttribute('aria-label', `Change key binding, currently ${keyLabel(keyBindings[id])}`);
    keyButton.addEventListener('click', () => {
      const previous = listeningEntry;
      listeningEntry = id;
      if (previous && previous !== id) showKeyBinding(previous);
      showKeyBinding(id);
      notify('Press a number pad key from 0 to 9');
    });
    tools.append(keyButton);
    top.append(icon, copy, tools);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    for (const mode of modes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = mode;
      button.dataset.mode = mode;
      button.addEventListener('click', () => setSelectedMode(id, mode));
      actions.append(button);
    }
    card.append(top, actions);
    return card;
  }
  function setPlayingState(entryId) {
    const card = grid.querySelector(`[data-entry="${CSS.escape(entryId)}"]`);
    if (!card) return;
    const isPlaying = [...players.values()].some((player) => player.entry.id === entryId);
    card.classList.toggle('is-playing', isPlaying);
  }
  function stopSound(playbackId) {
    const player = players.get(playbackId);
    if (!player) return;
    const entryId = player.entry.id;
    if (player.background) {
      const position = player.audio.currentTime;
      resumePositions.set(entryId, position);
      player.entry.resumeAt = position;
      store.save(player.entry).catch(() => {});
    } else {
      resumePositions.delete(entryId);
    }
    player.audio.pause();
    if (!player.background) player.audio.currentTime = 0;
    clearTimeout(player.rampTimer);
    if (player.rampFrame) cancelAnimationFrame(player.rampFrame);
    player.source?.disconnect();
    player.gainNode?.disconnect();
    players.delete(playbackId);
    setPlayingState(entryId);
  }
  function stopAll() {
    [...players.keys()].forEach(stopSound);
  }
  function playerCount(entryId) {
    return [...players.values()].filter((player) => player.entry.id === entryId).length + (pendingPlayers.get(entryId) || 0);
  }
  function reservePlayer(entryId) {
    pendingPlayers.set(entryId, (pendingPlayers.get(entryId) || 0) + 1);
  }
  function releasePlayer(entryId) {
    const remaining = (pendingPlayers.get(entryId) || 1) - 1;
    if (remaining > 0) pendingPlayers.set(entryId, remaining);
    else pendingPlayers.delete(entryId);
  }
  function wakeAudioContext() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      audioContext ||= new Context();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch {
      return null;
    }
  }
  function levelAt(player, time) {
    const ramp = player.ramp;
    if (!ramp || time >= ramp.end) return ramp?.to ?? player.initialLevel;
    if (time <= ramp.start) return ramp.from;
    const progress = (time - ramp.start) / (ramp.end - ramp.start);
    return ramp.from + (ramp.to - ramp.from) * progress;
  }
  function rampLevel(id, player, target, duration = FADE_DURATION_MS, stopAtEnd = false) {
    clearTimeout(player.rampTimer);
    if (player.rampFrame) cancelAnimationFrame(player.rampFrame);
    const context = player.context;
    const start = context ? context.currentTime : performance.now();
    const seconds = duration / 1000;
    const from = levelAt(player, start);
    player.ramp = { from, to: target, start, end: start + (context ? seconds : duration) };

    if (player.gainNode) {
      const gain = player.gainNode.gain;
      gain.cancelScheduledValues(start);
      gain.setValueAtTime(from, start);
      gain.linearRampToValueAtTime(target, start + seconds);
    } else {
      const tick = (now) => {
        if (players.get(id) !== player) return;
        player.audio.volume = levelAt(player, now);
        if (now < player.ramp.end) player.rampFrame = requestAnimationFrame(tick);
      };
      player.rampFrame = requestAnimationFrame(tick);
    }

    if (stopAtEnd) {
      player.rampTimer = setTimeout(() => {
        if (players.get(id) === player) stopSound(id);
      }, duration);
    }
  }
  function fadeOutOthers(exceptEntryId) {
    for (const [playbackId, player] of players) {
      if (player.entry.id !== exceptEntryId) rampLevel(playbackId, player, 0, FADE_DURATION_MS, true);
    }
  }
  function waitForMetadata(audio) {
    if (audio.error) return Promise.reject(audio.error);
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
      audio.load();
    });
  }
  function setting(value, fallback, min, max) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  async function playEntry(id, mode) {
    const sameEntryPlayers = [...players.entries()].filter(([, player]) => player.entry.id === id);
    if (sameEntryPlayers.length && mode !== 'Overlay') {
      sameEntryPlayers.forEach(([playbackId]) => stopSound(playbackId));
      return;
    }
    if (playerCount(id) >= 10) {
      notify('This sound already has 10 players');
      return;
    }
    if (mode !== 'Overlay' && pendingPlayers.has(id)) return;
    reservePlayer(id);
    let reserved = true;
    let playbackId;
    try {
      const entries = await store.all();
      const entry = entries.find((item) => item.id === id);
      if (!entry) return;
      if (!audioUrls.has(id)) audioUrls.set(id, URL.createObjectURL(entry.blob));
      const audio = new Audio(audioUrls.get(id));
      audio.preload = 'auto';
      const startAt = setting(entry.startAt, 0, 0, Number.isFinite(entry.duration) ? Math.max(0, entry.duration - 0.05) : Number.MAX_SAFE_INTEGER);
      const targetLevel = setting(entry.volume, 1, 0, 1);
      try {
        await waitForMetadata(audio);
      } catch {
        notify('This audio file could not be loaded');
        return;
      }
      const playbackStart = Math.min(startAt, Math.max(0, audio.duration - 0.05));
      const requestedEnd = entry.endAt !== null && entry.endAt !== undefined && Number.isFinite(Number(entry.endAt)) ? Number(entry.endAt) : audio.duration;
      const clipEnd = Math.max(Math.min(playbackStart + 0.05, audio.duration), Math.min(requestedEnd, audio.duration));
      const requestedResumeAt = entry.background ? (resumePositions.get(id) ?? entry.resumeAt) : playbackStart;
      const resumeAt = setting(requestedResumeAt, playbackStart, playbackStart, Math.max(playbackStart, clipEnd - 0.05));
      audio.currentTime = resumeAt;
      if (mode === 'CutIn') stopAll();
      else if (mode === 'FadeIn') fadeOutOthers(id);
      playbackId = `${id}:${++playbackSequence}`;
      await outputTask;
      const context = wakeAudioContext();
      if (outputSupported && context && context.sinkId !== selectedOutput) await context.setSinkId(selectedOutput);
      const player = { audio, entry, mode, context, background: Boolean(entry.background), startAt: playbackStart, endAt: clipEnd, targetLevel, initialLevel: mode === 'FadeIn' ? 0 : targetLevel, ramp: null, rampTimer: null, rampFrame: null, source: null, gainNode: null };
      player.ramp = { from: player.initialLevel, to: player.initialLevel, start: context ? context.currentTime : performance.now(), end: context ? context.currentTime : performance.now() };
      audio.volume = 1;
      if (context) {
        try {
          player.source = context.createMediaElementSource(audio);
          player.gainNode = context.createGain();
          player.gainNode.gain.setValueAtTime(player.initialLevel, context.currentTime);
          player.source.connect(player.gainNode);
          player.gainNode.connect(context.destination);
        } catch {
          player.source?.disconnect();
          player.gainNode?.disconnect();
          player.source = null;
          player.gainNode = null;
          player.context = null;
          audio.volume = player.initialLevel;
        }
      } else {
        audio.volume = player.initialLevel;
      }
      if (outputSupported && !player.gainNode) await audio.setSinkId(selectedOutput);
      players.set(playbackId, player);
      releasePlayer(id);
      reserved = false;
      const loopOrStopAtEnd = () => {
        if (players.get(playbackId) !== player) return;
        if (player.background) {
          audio.currentTime = player.startAt;
          audio.play().catch(() => stopSound(playbackId));
        } else {
          stopSound(playbackId);
        }
      };
      audio.addEventListener('timeupdate', () => {
        if (audio.currentTime >= player.endAt) loopOrStopAtEnd();
      });
      audio.addEventListener('ended', () => {
        loopOrStopAtEnd();
      });
      audio.addEventListener('error', () => { stopSound(playbackId); notify('This audio file could not be played'); }, { once: true });
      if (player.context?.state === 'suspended') {
        await player.context.resume();
      }
      await audio.play();
      setPlayingState(id);
      if (mode === 'FadeIn') {
        rampLevel(playbackId, player, targetLevel);
      }
    } catch {
      if (playbackId) stopSound(playbackId);
      notify('This audio file could not be played');
    } finally {
      if (reserved) releasePlayer(id);
    }
  }
  async function renderBoard() {
    boardEntries = (await store.all()).filter((entry) => entry.showOnBoard).sort((a, b) => (a.added || 0) - (b.added || 0)).slice(0, 10);
    assignDefaultKeys(boardEntries);
    iconUrls.forEach(URL.revokeObjectURL);
    iconUrls.length = 0;
    grid.replaceChildren(...boardEntries.map(makeCard));
    for (const entry of boardEntries) setSelectedMode(entry.id, modes.includes(selectedModes[entry.id]) ? selectedModes[entry.id] : 'CutIn');
    document.querySelector('#board-count').textContent = `${boardEntries.length} / 10 on board`;
    emptyState.hidden = boardEntries.length > 0;
    grid.hidden = boardEntries.length === 0;
    if (listeningEntry && !boardEntries.some((entry) => entry.id === listeningEntry)) listeningEntry = null;
  }

  document.addEventListener('keydown', (event) => {
    if (listeningEntry) {
      if (event.key === 'Escape') {
        const pending = listeningEntry;
        listeningEntry = null;
        showKeyBinding(pending);
        return;
      }
      if (!/^Numpad[0-9]$/.test(event.code)) return;
      event.preventDefault();
      const duplicate = boardEntries.find((entry) => entry.id !== listeningEntry && keyBindings[entry.id] === event.code);
      if (duplicate) {
        notify(`${keyLabel(event.code)} is already assigned to ${duplicate.title || duplicate.name}`);
        return;
      }
      const assigned = listeningEntry;
      keyBindings[assigned] = event.code;
      listeningEntry = null;
      saveObject('soundboard-key-bindings', keyBindings);
      showKeyBinding(assigned);
      notify(`${keyLabel(event.code)} assigned`);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const entry = boardEntries.find((item) => keyBindings[item.id] === event.code);
    if (!entry) return;
    const mode = selectedModes[entry.id] || 'CutIn';
    if (event.repeat && mode !== 'Overlay') return;
    event.preventDefault();
    wakeAudioContext();
    playEntry(entry.id, mode);
  });

  window.SoundboardStore.then(async (opened) => {
    store = opened;
    await renderBoard();
  }).catch(() => notify('Browser storage is unavailable'));
})();
