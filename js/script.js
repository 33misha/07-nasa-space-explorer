/* NASA Space Explorer — all custom behavior lives in this file. */
(() => {
  'use strict';

  const startInput = document.getElementById('startDate');
  const endInput = document.getElementById('endDate');
  const dateForm = document.getElementById('dateForm');
  const fetchButton = document.getElementById('fetchButton');
  const latestButton = document.getElementById('latestButton');
  const gallery = document.getElementById('gallery');
  const summary = document.getElementById('gallerySummary');
  const loadingMessage = document.getElementById('loadingMessage');
  const errorMessage = document.getElementById('errorMessage');
  const modal = document.getElementById('apodModal');
  const modalMedia = document.getElementById('modalMedia');
  const keyInput = document.getElementById('apiKey');
  const keyStatus = document.getElementById('keyStatus');
  const API_URL = 'https://api.nasa.gov/planetary/apod';
  const KEY_STORAGE = 'nasa-space-explorer-api-key';
  const DAY = 24 * 60 * 60 * 1000;
  let apiKey = 'DEMO_KEY';
  let lastCard = null;
  let activeRequest = null;
  let currentFact = -1;

  // UTC arithmetic keeps nine calendar days correct across daylight saving time.
  function shiftDate(date, days) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  }

  function nasaToday() {
    // APOD publishes on the US Eastern calendar, which can differ from UTC.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const part = (type) => parts.find((value) => value.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
  }

  function refreshDateLimits() {
    // earliestDate comes from the unchanged starter dateRange.js.
    startInput.min = earliestDate;
    startInput.max = shiftDate(nasaToday(), -8);
    endInput.min = shiftDate(earliestDate, 8);
    endInput.max = nasaToday();
  }

  function selectLatestDates() {
    refreshDateLimits();
    endInput.value = endInput.max;
    startInput.value = shiftDate(endInput.value, -8);
  }

  function linkDates(changedInput) {
    if (!changedInput.value || !changedInput.validity.valid) return;
    if (changedInput === startInput) endInput.value = shiftDate(startInput.value, 8);
    else startInput.value = shiftDate(endInput.value, -8);
  }

  // Only absolute HTTP(S) addresses from the response may become links/media.
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function plainText(value) {
    // NASA's newer responses contain HTML. Parse it without adding it to the page.
    const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
    parsed.querySelectorAll('script, style').forEach((node) => node.remove());
    return (parsed.body.textContent || '').trim();
  }

  function normalizeEntry(item) {
    // Older APOD responses use url for media; newer ones use it for the article.
    const html = new DOMParser().parseFromString(item.basic_html || '', 'text/html');
    const isVideo = item.media_type === 'video' || item.media_type === 'iframe';
    const embedded = html.querySelector('iframe, video source, video, embed');
    const image = html.querySelector('img');
    const article = safeUrl(item.permalink) || (item.post_id ? safeUrl(item.url) : '');
    const media = isVideo
      ? safeUrl(embedded?.getAttribute('src')) || (!article ? safeUrl(item.url) : '')
      : safeUrl(item.hdurl) || safeUrl(image?.getAttribute('src')) || (!article ? safeUrl(item.url) : '');
    let preview = isVideo ? safeUrl(item.thumbnail_url)
      || safeUrl(html.querySelector('meta[property="og:image"]')?.getAttribute('content'))
      : (!article ? safeUrl(item.url) : '') || media;
    // Request a lighter gallery image from NASA's image service; keep the HD original.
    if (preview && new URL(preview).hostname === 'assets.science.nasa.gov') {
      const thumbnail = new URL(preview);
      thumbnail.searchParams.set('w', '900');
      thumbnail.searchParams.delete('h');
      preview = thumbnail.href;
    }
    return {
      date: item.date,
      title: plainText(item.title) || 'Astronomy Picture of the Day',
      explanation: plainText(item.explanation) || 'Read the original APOD entry for more information.',
      credit: plainText(item.copyright || item.credit),
      isVideo,
      media,
      preview,
      original: article || media || `https://apod.nasa.gov/apod/ap${item.date.slice(2).replaceAll('-', '')}.html`
    };
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function mediaPlaceholder(text) {
    return makeElement('span', 'media-placeholder', text);
  }

  function createCard(entry) {
    const card = makeElement('button', 'gallery-item');
    card.type = 'button';
    card.setAttribute('aria-label', `Explore ${entry.title}, ${formatDate(entry.date)}`);
    const media = makeElement('div', 'card-media');
    if (entry.preview) {
      const image = document.createElement('img');
      image.src = entry.preview;
      image.alt = entry.title;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        image.replaceWith(mediaPlaceholder('Preview unavailable · Open to explore'));
      }, { once: true });
      media.append(image);
    } else {
      media.append(mediaPlaceholder(entry.isVideo ? '▶ Explore this space video' : 'Open the original APOD'));
    }
    media.append(makeElement('span', 'media-badge', entry.isVideo ? '▶ Video' : 'Image'));
    const body = makeElement('div', 'card-body');
    const date = makeElement('time', 'card-date', formatDate(entry.date));
    date.dateTime = entry.date;
    body.append(date, makeElement('h3', 'card-title', entry.title),
      makeElement('span', 'card-action', 'Explore the story ↗'));
    card.append(media, body);
    card.addEventListener('click', () => openModal(entry, card));
    return card;
  }

  // Embed familiar video providers; other providers always get a working link.
  function videoEmbedUrl(value) {
    if (!value) return '';
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
      const id = host === 'youtu.be' ? url.pathname.slice(1)
        : url.searchParams.get('v') || url.pathname.split('/').pop();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = url.pathname.split('/').pop();
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return '';
  }

  function openModal(entry, card) {
    lastCard = card;
    modalMedia.replaceChildren();
    document.getElementById('modalTitle').textContent = entry.title;
    const date = document.getElementById('modalDate');
    date.textContent = formatDate(entry.date);
    date.dateTime = entry.date;
    document.getElementById('modalExplanation').textContent = entry.explanation;
    document.getElementById('modalCredit').textContent = entry.credit ? `Credit: ${entry.credit}` : 'Source: NASA Astronomy Picture of the Day';
    const originalLink = document.getElementById('originalLink');
    originalLink.href = entry.media || entry.original;
    originalLink.textContent = entry.isVideo ? 'Open original video ↗' : 'Open full-size original ↗';
    if (!entry.isVideo && entry.media) {
      const image = makeElement('img', 'modal-image');
      image.src = entry.media;
      image.alt = entry.title;
      image.addEventListener('error', () => {
        image.replaceWith(makeElement('p', 'modal-fallback', 'This image could not load. Use the original link below to view it.'));
      }, { once: true });
      modalMedia.append(image);
    } else if (entry.isVideo && videoEmbedUrl(entry.media)) {
      const iframe = makeElement('iframe', 'modal-video');
      iframe.src = videoEmbedUrl(entry.media);
      iframe.title = entry.title;
      iframe.allow = 'fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      modalMedia.append(iframe);
    } else if (entry.isVideo && /\.(mp4|webm|ogg)(\?|$)/i.test(entry.media)) {
      const video = makeElement('video', 'modal-video');
      video.src = entry.media;
      video.controls = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', entry.title);
      modalMedia.append(video);
    } else {
      modalMedia.append(makeElement('p', 'modal-fallback', entry.isVideo
        ? 'This video opens on its original site. Follow the link below to watch.'
        : 'View this entry on its original APOD page using the link below.'));
    }
    // Keep a direct link available even if a provider blocks its embedded player.
    if (entry.isVideo) {
      const link = makeElement('a', 'media-link', 'Watch on the original site ↗');
      link.href = entry.media || entry.original;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      modalMedia.append(link);
    }
    modal.showModal();
    document.body.classList.add('modal-open');
    document.getElementById('closeModal').focus();
  }

  function setLoading(isLoading) {
    loadingMessage.hidden = !isLoading;
    gallery.setAttribute('aria-busy', String(isLoading));
    fetchButton.disabled = isLoading;
    fetchButton.textContent = isLoading ? 'Loading space images…' : 'Get Space Images';
    latestButton.disabled = isLoading;
    startInput.disabled = isLoading;
    endInput.disabled = isLoading;
  }

  function showError(message) {
    document.getElementById('errorText').textContent = message;
    errorMessage.hidden = false;
  }

  async function fetchGallery(event) {
    if (event) event.preventDefault();
    refreshDateLimits();
    if (!dateForm.reportValidity()) return;
    const start = startInput.value;
    const end = endInput.value;
    if (shiftDate(start, 8) !== end) {
      showError('Choose nine consecutive days: the end date must be eight days after the start date.');
      return;
    }
    if (activeRequest) activeRequest.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    errorMessage.hidden = true;
    gallery.replaceChildren();
    summary.textContent = `Exploring ${formatDate(start)} – ${formatDate(end)}…`;
    setLoading(true);
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ api_key: apiKey, start_date: start, end_date: end, thumbs: 'true' });
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status === 429) throw new Error('NASA’s request limit has been reached. Try again later or add your free NASA API key in API settings.');
        if (response.status === 401 || response.status === 403) throw new Error('NASA could not accept this API key. Check your key in API settings, then try again.');
        throw new Error(`NASA could not complete this request (HTTP ${response.status}). Try again shortly or choose an earlier nine-day range.`);
      }
      let data = await response.json();
      let usedArchive = false;
      // During NASA's migration, the legacy endpoint sometimes returns its site
      // logo for every date. Retrieve real entries from NASA's documented archive.
      if (Array.isArray(data) && data.some((item) => item?.title === 'NASA Science'
        && String(item.url).includes('nasa-logo'))) {
        const archiveUrl = new URL('https://science.nasa.gov/wp-json/wp/v2/apod-basic');
        archiveUrl.search = new URLSearchParams({
          date_from: start.replaceAll('-', '').slice(2),
          date_to: end.replaceAll('-', '').slice(2)
        });
        const archiveResponse = await fetch(archiveUrl, { signal: controller.signal });
        if (!archiveResponse.ok) throw new Error('NASA’s archive is temporarily unavailable. Try again shortly.');
        data = await archiveResponse.json();
        usedArchive = true;
      }
      if (!Array.isArray(data)) throw new Error('NASA returned an unexpected response. Please try again shortly.');
      // Check actual dates, not only the array length; never silently omit videos.
      const byDate = new Map(data.filter((item) => item && typeof item.date === 'string')
        .map((item) => [item.date, item]));
      const entries = [];
      for (let index = 0; index < 9; index += 1) {
        const date = shiftDate(start, index);
        if (!byDate.has(date)) throw new Error('NASA has not returned all nine days for this range. Today’s entry may still be publishing. Try again shortly or select an earlier range.');
        entries.push(normalizeEntry(byDate.get(date)));
      }
      gallery.replaceChildren(...entries.map(createCard));
      summary.textContent = `9 discoveries · ${formatDate(start)} – ${formatDate(end)}${usedArchive ? ' · NASA Science archive' : ''}`;
    } catch (error) {
      if (activeRequest !== controller) return;
      summary.textContent = 'Your next discovery is still out there.';
      showError(error.name === 'AbortError'
        ? 'NASA is taking longer than expected. Check your connection and try again.'
        : error instanceof TypeError ? 'We could not reach NASA. Check your internet connection and try again.' : error.message);
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) {
        setLoading(false);
        activeRequest = null;
      }
    }
  }

  const facts = [
    { text: 'Venus takes about 243 Earth days to rotate once, but only about 225 Earth days to orbit the Sun.', url: 'https://science.nasa.gov/venus/venus-facts/' },
    { text: 'Jupiter has the shortest day of any planet in our solar system: it rotates once in about 9.9 hours.', url: 'https://science.nasa.gov/jupiter/jupiter-facts/' },
    { text: 'Mars is home to Olympus Mons, the largest volcano in our solar system.', url: 'https://science.nasa.gov/mars/facts/' },
    { text: 'Ganymede, Jupiter’s largest moon, is bigger than the planet Mercury.', url: 'https://science.nasa.gov/jupiter/jupiter-facts/' },
    { text: 'A year on Mars lasts about 687 Earth days, while a Martian day lasts about 24.6 hours.', url: 'https://science.nasa.gov/mars/facts/' }
  ];

  function showRandomFact() {
    // Pick a different fact when the visitor asks for another one.
    const next = currentFact < 0 ? Math.floor(Math.random() * facts.length)
      : (currentFact + 1 + Math.floor(Math.random() * (facts.length - 1))) % facts.length;
    currentFact = next;
    document.getElementById('spaceFact').textContent = facts[next].text;
    document.getElementById('factSource').href = facts[next].url;
  }

  try {
    apiKey = localStorage.getItem(KEY_STORAGE) || 'DEMO_KEY';
  } catch {
    // Private browsing may block storage; the app can still use its demo key.
  }
  keyStatus.textContent = apiKey === 'DEMO_KEY'
    ? 'Using NASA’s shared demo key. Add your own key if you reach its request limit.'
    : 'Your NASA API key is active in this browser.';

  document.getElementById('apiKeyForm').addEventListener('submit', (event) => {
    event.preventDefault();
    apiKey = keyInput.value.trim() || 'DEMO_KEY';
    let saved = true;
    try {
      if (apiKey === 'DEMO_KEY') localStorage.removeItem(KEY_STORAGE);
      else localStorage.setItem(KEY_STORAGE, apiKey);
    } catch {
      saved = false;
    }
    keyInput.value = '';
    keyStatus.textContent = apiKey === 'DEMO_KEY' ? 'Using NASA’s shared demo key.'
      : saved ? 'API key saved in this browser. Fetch images to use it.' : 'API key active for this visit; browser storage is unavailable.';
  });

  startInput.addEventListener('change', () => linkDates(startInput));
  endInput.addEventListener('change', () => linkDates(endInput));
  dateForm.addEventListener('submit', fetchGallery);
  document.getElementById('retryButton').addEventListener('click', () => fetchGallery());
  latestButton.addEventListener('click', () => { selectLatestDates(); fetchGallery(); });
  document.getElementById('newFactButton').addEventListener('click', showRandomFact);
  document.getElementById('closeModal').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => {
    const bounds = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom)) modal.close();
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    // Wrap keyboard navigation between the dialog's first and last controls.
    const controls = modal.querySelectorAll('button, a[href], iframe, video[controls]');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  modal.addEventListener('close', () => {
    // Removing the iframe/video also stops playback when the modal closes.
    modalMedia.replaceChildren();
    document.body.classList.remove('modal-open');
    if (lastCard?.isConnected) lastCard.focus();
  });

  selectLatestDates();
  showRandomFact();
  fetchGallery();
})();
