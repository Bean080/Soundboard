(() => {
  const MAX_BOARD_SOUNDS = 20;
  const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const form = document.querySelector('#entry-form');
  const list = document.querySelector('#entry-list');
  const audioInput = document.querySelector('#entry-audio');
  const iconInput = document.querySelector('#entry-icon');
  const toast = document.querySelector('#toast');
  let store;
  let toastTimer;
  let iconUrls = [];
  let previewAudio = null;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  }
  function safeName(file) {
    return file.name.replace(/\.[^.]+$/, '').replace(/[\-_]+/g, ' ').trim() || file.name;
  }
  function formatSize(bytes = 0) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'Audio file';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }
  function formatPosition(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }
  function readDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      const timer = setTimeout(() => finish(null), 3000);
      function finish(duration) {
        clearTimeout(timer);
        audio.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve(duration);
      }
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => finish(null);
    });
  }
  function clearPreviewUrls() {
    iconUrls.forEach(URL.revokeObjectURL);
    iconUrls = [];
  }
  function stopPreview(audio = previewAudio) {
    if (!audio) return;
    if (previewAudio === audio) previewAudio = null;
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    URL.revokeObjectURL(audio.previewUrl);
    audio.removeAttribute('src');
    audio.load();
  }
  async function playTest(entry) {
    stopPreview();
    const audio = new Audio(URL.createObjectURL(entry.blob));
    audio.previewUrl = audio.src;
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, Number(entry.volume ?? 1)));
    previewAudio = audio;
    const finishPreview = () => {
      if (previewAudio === audio) stopPreview(audio);
    };
    try {
      await new Promise((resolve, reject) => {
        if (audio.readyState >= 1) return resolve();
        audio.addEventListener('loadedmetadata', resolve, { once: true });
        audio.addEventListener('error', reject, { once: true });
        audio.load();
      });
      if (previewAudio !== audio) return;
      const startAt = Math.min(Math.max(0, Number(entry.startAt) || 0), Math.max(0, audio.duration - 0.05));
      const requestedEnd = entry.endAt !== null && entry.endAt !== undefined && Number.isFinite(Number(entry.endAt)) ? Number(entry.endAt) : audio.duration;
      const endAt = Math.max(Math.min(startAt + 0.05, audio.duration), Math.min(requestedEnd, audio.duration));
      audio.currentTime = startAt;
      audio.addEventListener('timeupdate', () => {
        if (previewAudio === audio && audio.currentTime >= endAt) finishPreview();
      });
      audio.addEventListener('ended', finishPreview);
      await audio.play();
    } catch {
      if (previewAudio === audio) {
        stopPreview(audio);
        notify('This audio file could not be played');
      }
    }
  }
  function createEntryCard(entry, index, selectedCount) {
    const card = document.createElement('article');
    card.className = 'entry-card';
    const visual = document.createElement('div');
    visual.className = 'entry-visual';
    visual.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    image.alt = '';
    if (entry.iconBlob) {
      const url = URL.createObjectURL(entry.iconBlob);
      iconUrls.push(url);
      image.src = url;
    } else {
      image.src = 'assets/app-icon.png';
      image.className = 'app-logo';
    }
    visual.append(image);
    const details = document.createElement('div');
    details.className = 'entry-details';
    const title = document.createElement('h3');
    title.textContent = entry.title || entry.name || `Sound ${index + 1}`;
    const metadata = document.createElement('p');
    metadata.textContent = `${entry.fileName || 'Audio file'} · ${formatSize(entry.size)} · ${formatDuration(entry.duration)}`;
    details.append(title, metadata);
    const checkLabel = document.createElement('label');
    checkLabel.className = 'board-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(entry.showOnBoard);
    checkbox.setAttribute('aria-label', `Show ${title.textContent} on the main board`);
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked && selectedCount >= MAX_BOARD_SOUNDS) {
        checkbox.checked = false;
        notify(`The main board can show up to ${MAX_BOARD_SOUNDS} sounds`);
        return;
      }
      entry.showOnBoard = checkbox.checked;
      try {
        await store.save(entry);
        await renderEntries();
      } catch {
        checkbox.checked = !checkbox.checked;
        notify('Could not update this entry');
      }
    });
    const checkText = document.createElement('span');
    checkText.textContent = 'Board';
    checkLabel.append(checkbox, checkText);
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const test = document.createElement('button');
    test.className = 'test-entry';
    test.type = 'button';
    test.textContent = '▶ Test';
    test.setAttribute('aria-label', `Test ${title.textContent} as a cut in`);
    test.addEventListener('click', () => playTest(entry));
    actions.append(test);
    const remove = document.createElement('button');
    remove.className = 'remove-entry';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${title.textContent} from the library`);
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove “${title.textContent}” from your library?`)) return;
      await store.remove(entry.id);
      await renderEntries();
      notify('Entry removed');
    });
    actions.append(remove);
    const settings = document.createElement('div');
    settings.className = 'entry-settings';

    const backgroundLabel = document.createElement('label');
    backgroundLabel.className = 'background-setting';
    const backgroundInput = document.createElement('input');
    backgroundInput.type = 'checkbox';
    backgroundInput.checked = Boolean(entry.background);
    backgroundInput.setAttribute('aria-label', `Set ${title.textContent} as background audio`);
    const switchTrack = document.createElement('span');
    switchTrack.className = 'switch-track';
    switchTrack.setAttribute('aria-hidden', 'true');
    const backgroundText = document.createElement('span');
    backgroundText.innerHTML = '<strong>Background</strong><small>Loop and resume</small>';
    backgroundInput.addEventListener('change', async () => {
      entry.background = backgroundInput.checked;
      if (!entry.background) entry.resumeAt = null;
      try { await store.save(entry); }
      catch { backgroundInput.checked = !backgroundInput.checked; notify('Could not save this setting'); }
    });
    backgroundLabel.append(backgroundInput, switchTrack, backgroundText);

    const trimSetting = document.createElement('div');
    trimSetting.className = 'range-setting range-pair';
    const trimHeading = document.createElement('div');
    trimHeading.className = 'range-heading range-pair-heading';
    const startValue = document.createElement('span');
    const startName = document.createElement('span');
    startName.textContent = 'Start at';
    const startOutput = document.createElement('output');
    startValue.append(startName, startOutput);
    const endValue = document.createElement('span');
    const endName = document.createElement('span');
    endName.textContent = 'End at';
    const endOutput = document.createElement('output');
    endValue.append(endName, endOutput);
    trimHeading.append(startValue, endValue);
    const trimTrack = document.createElement('div');
    trimTrack.className = 'range-track';
    const duration = Number.isFinite(entry.duration) ? entry.duration : 0;
    const clipGap = Math.min(0.1, duration);
    const startInput = document.createElement('input');
    startInput.type = 'range';
    startInput.className = 'start-thumb';
    startInput.setAttribute('aria-label', `Start time for ${title.textContent}`);
    startInput.min = '0';
    startInput.max = String(duration);
    startInput.step = '0.1';
    startInput.value = String(Math.min(Number(entry.startAt) || 0, Math.max(0, duration - clipGap)));
    startInput.disabled = !Number.isFinite(entry.duration) || entry.duration <= 0.1;
    const updateStartOutput = () => { startOutput.textContent = formatPosition(startInput.value); };
    updateStartOutput();
    const endInput = document.createElement('input');
    const clipStart = Number(startInput.value) || 0;
    endInput.type = 'range';
    endInput.className = 'end-thumb';
    endInput.setAttribute('aria-label', `End time for ${title.textContent}`);
    endInput.min = '0';
    endInput.max = String(duration);
    endInput.step = '0.1';
    endInput.value = String(Math.min(duration, Math.max(Number(entry.endAt) || duration, clipStart + clipGap)));
    endInput.disabled = !Number.isFinite(entry.duration) || entry.duration <= 0.1;
    const updateEndOutput = () => { endOutput.textContent = formatPosition(endInput.value); };
    const constrainStartToEnd = () => {
      const latestStart = Math.max(0, Number(endInput.value) - clipGap);
      if (Number(startInput.value) > latestStart) startInput.value = String(latestStart);
      updateStartOutput();
      updateTrimTrack();
    };
    const constrainEndToStart = () => {
      const earliestEnd = Math.min(duration, Number(startInput.value) + clipGap);
      if (Number(endInput.value) < earliestEnd) endInput.value = String(earliestEnd);
      updateEndOutput();
      updateTrimTrack();
    };
    const updateTrimTrack = () => {
      const scale = duration > 0 ? 100 / duration : 0;
      trimTrack.style.setProperty('--trim-start', `${(Number(startInput.value) || 0) * scale}%`);
      trimTrack.style.setProperty('--trim-end', `${(Number(endInput.value) || 0) * scale}%`);
    };
    updateEndOutput();
    updateTrimTrack();
    startInput.addEventListener('input', constrainStartToEnd);
    startInput.addEventListener('change', async () => {
      entry.startAt = Number(startInput.value);
      entry.endAt = Number(endInput.value);
      entry.resumeAt = null;
      try { await store.save(entry); }
      catch { notify('Could not save the start position'); }
    });
    endInput.addEventListener('input', constrainEndToStart);
    endInput.addEventListener('change', async () => {
      entry.startAt = Number(startInput.value);
      entry.endAt = Number(endInput.value);
      entry.resumeAt = null;
      try { await store.save(entry); }
      catch { notify('Could not save the end position'); }
    });
    trimTrack.append(startInput, endInput);
    trimSetting.append(trimHeading, trimTrack);

    const volumeLabel = document.createElement('label');
    volumeLabel.className = 'range-setting';
    const volumeHeading = document.createElement('span');
    volumeHeading.className = 'range-heading';
    const volumeName = document.createElement('span');
    volumeName.textContent = 'Volume';
    const volumeOutput = document.createElement('output');
    const volumeInput = document.createElement('input');
    volumeInput.type = 'range';
    volumeInput.min = '0';
    volumeInput.max = '1';
    volumeInput.step = '0.01';
    volumeInput.value = String(Math.max(0, Math.min(1, Number(entry.volume ?? 1))));
    const updateVolumeOutput = () => { volumeOutput.textContent = `${Math.round(Number(volumeInput.value) * 100)}%`; };
    updateVolumeOutput();
    volumeInput.addEventListener('input', updateVolumeOutput);
    volumeInput.addEventListener('change', async () => {
      entry.volume = Number(volumeInput.value);
      try { await store.save(entry); }
      catch { notify('Could not save the volume'); }
    });
    volumeHeading.append(volumeName, volumeOutput);
    volumeLabel.append(volumeHeading, volumeInput);

    settings.append(backgroundLabel, trimSetting, volumeLabel);
    card.append(checkLabel, visual, details, actions, settings);
    return card;
  }
  async function renderEntries() {
    const entries = (await store.all()).sort((a, b) =>
      titleCollator.compare((a.title || a.name || '').trim(), (b.title || b.name || '').trim()) ||
      (a.added || 0) - (b.added || 0));
    const selectedCount = entries.filter((entry) => entry.showOnBoard).length;
    document.querySelector('#selection-count').textContent = `${selectedCount} / ${MAX_BOARD_SOUNDS} on board`;
    document.querySelector('#library-empty').hidden = entries.length !== 0;
    clearPreviewUrls();
    list.replaceChildren(...entries.map((entry, index) => createEntryCard(entry, index, selectedCount)));
  }

  function isAudioFile(file) {
    return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|aiff?|wma)$/i.test(file.name);
  }
  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }
  function isImageFile(file) {
    return file.type.startsWith('image/');
  }
  function draggedFile(event) {
    const items = Array.from(event.dataTransfer?.items || []).filter((item) => item.kind === 'file');
    if (items.length) {
      if (items.length !== 1) return null;
      // During a native file drag, browsers expose its type before its name or contents.
      return items[0].getAsFile() || { type: items[0].type, name: '' };
    }
    const files = event.dataTransfer?.files;
    return files?.length === 1 ? files[0] : null;
  }
  function setupFileDrop(input, { isValid, multipleMessage, invalidMessage, selectedMessage }) {
    const zone = input.closest('.file-drop-zone');
    const compatible = (event) => {
      const file = draggedFile(event);
      return Boolean(file && isValid(file));
    };
    let dragDepth = 0;
    function reset() {
      dragDepth = 0;
      zone.classList.remove('is-dragging');
    }
    zone.addEventListener('dragenter', (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      zone.classList.toggle('is-dragging', compatible(event));
    });
    zone.addEventListener('dragover', (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      zone.classList.toggle('is-dragging', compatible(event));
      event.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) reset();
    });
    zone.addEventListener('drop', (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDropZones();
      const files = Array.from(event.dataTransfer.files);
      if (files.length !== 1) {
        notify(multipleMessage);
        return;
      }
      if (!isValid(files[0])) {
        notify(invalidMessage);
        return;
      }
      const selection = new DataTransfer();
      selection.items.add(files[0]);
      input.files = selection.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      notify(selectedMessage);
    });
    return {
      reset() {
        reset();
        zone.classList.remove('is-compatible-drag');
      },
      update(event) {
        zone.classList.toggle('is-compatible-drag', compatible(event));
      },
    };
  }
  const dropZones = [
    setupFileDrop(audioInput, {
      isValid: isAudioFile,
      multipleMessage: 'Drop one audio file at a time',
      invalidMessage: 'Choose a valid audio file',
      selectedMessage: 'Audio selected. Choose a title, then add it to your library',
    }),
    setupFileDrop(iconInput, {
      isValid: isImageFile,
      multipleMessage: 'Drop one image at a time',
      invalidMessage: 'Choose an image for the optional icon',
      selectedMessage: 'Icon selected. Add the sound to your library to save it',
    }),
  ];
  let fileDragDepth = 0;
  function resetDropZones() {
    fileDragDepth = 0;
    dropZones.forEach((zone) => zone.reset());
  }
  document.addEventListener('dragenter', (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDragDepth += 1;
    dropZones.forEach((zone) => zone.update(event));
  });
  // Keep file drops outside the control from navigating away from the library.
  document.addEventListener('dragover', (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dropZones.forEach((zone) => zone.update(event));
  });
  document.addEventListener('drop', (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    resetDropZones();
  });
  document.addEventListener('dragleave', (event) => {
    if (!hasDraggedFiles(event)) return;
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    if (!fileDragDepth || (!event.relatedTarget && (event.target === document.documentElement || event.target === document))) resetDropZones();
  });
  document.addEventListener('dragend', resetDropZones);
  window.addEventListener('blur', resetDropZones);
  audioInput.addEventListener('change', () => {
    document.querySelector('#audio-choice').textContent = audioInput.files?.[0]?.name || 'Choose audio file';
  });
  iconInput.addEventListener('change', () => {
    document.querySelector('#icon-choice').textContent = iconInput.files?.[0]?.name || 'Choose image';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.querySelector('#entry-title').value.trim();
    const audio = audioInput.files?.[0];
    const icon = iconInput.files?.[0] || null;
    if (!title || !audio) return;
    if (!isAudioFile(audio)) {
      notify('Choose a valid audio file');
      return;
    }
    if (icon && !isImageFile(icon)) {
      notify('Choose an image for the optional icon');
      return;
    }
    const duration = await readDuration(audio);
    const id = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await store.save({
        id,
        title,
        name: title,
        fileName: audio.name,
        size: audio.size,
        duration,
        blob: audio,
        iconBlob: icon,
        iconName: icon?.name || null,
        showOnBoard: false,
        added: Date.now(),
        background: false,
        startAt: 0,
        endAt: duration,
        volume: 1,
      });
      form.reset();
      document.querySelector('#audio-choice').textContent = 'Choose audio file';
      document.querySelector('#icon-choice').textContent = 'Choose image';
      await renderEntries();
      notify('Sound added to your library');
    } catch (error) {
      notify(error?.name === 'QuotaExceededError' ? 'Device storage is full' : 'Could not save this sound');
    }
  });

  window.SoundboardStore.then(async (opened) => {
    store = opened;
    await renderEntries();
  }).catch(() => notify('Browser storage is unavailable'));
})();
