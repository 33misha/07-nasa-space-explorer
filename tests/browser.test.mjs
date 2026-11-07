import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBrowser, startServer, waitFor } from './browser-helper.mjs';

// API replies and external media are fixtures. These tests never spend a NASA
// request or require an internet connection; live API checks are separate.
function installApiMock() {
  const options = new URLSearchParams(location.search);
  if (!options.has('preserveStorage')) localStorage.clear();
  if (options.has('blockedStorage')) {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Storage.prototype[method] = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    }
  }
  if (options.has('quickTimeout')) {
    const nativeTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 30000 ? 150 : delay, ...args);
  }
  const originalFetch = window.fetch.bind(window);
  const state = { requests: [], pending: [], token: options.get('testRun') };
  window.__apodTest = state;
  window.fetch = (input, init = {}) => {
    const url = new URL(String(input), location.href);
    if (url.hostname !== 'api.nasa.gov' && !(url.hostname === 'science.nasa.gov' && url.pathname.includes('/wp-json/'))) {
      return originalFetch(input, init);
    }
    state.requests.push(url.href);
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      state.pending.push(pending);
      init.signal?.addEventListener('abort', () => {
        state.pending = state.pending.filter((request) => request !== pending);
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  };
  state.reply = (body, status = 200) => {
    const pending = state.pending.shift();
    if (!pending) throw new Error('No API request is waiting.');
    pending.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  };
  state.fail = () => state.pending.shift().reject(new TypeError('Failed to fetch'));
  state.malformed = () => state.pending.shift().resolve(new Response('{invalid json'));
}

const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const imageUrl = (name) => `https://fixtures.example.test/${name}.svg`;

function entriesFor(start) {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    date: shift(start, index), title: `Fixture discovery ${index + 1}`, explanation: `Explanation for discovery ${index + 1}.`,
    media_type: 'image', url: imageUrl(`image-${index}`), hdurl: imageUrl(`full-${index}`), copyright: 'NASA test fixture'
  }));
  entries[1] = {
    ...entries[1], post_id: 123, url: 'https://science.nasa.gov/apod/fixture/',
    title: '<b>Modern &amp; safe</b><script>window.injected = true</script>',
    explanation: '<p>A modern <em>NASA explanation</em>.</p><script>window.injected = true</script>',
    basic_html: `<img src="${imageUrl('html-image')}">`
  };
  entries[2] = { ...entries[2], media_type: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk', thumbnail_url: imageUrl('video-thumbnail') };
  entries[3] = {
    ...entries[3], media_type: 'iframe', post_id: 124, url: 'https://science.nasa.gov/apod/video-fixture/',
    basic_html: '<iframe src="//www.youtube.com/embed/abcdefghijk"></iframe>'
  };
  entries[4] = { ...entries[4], media_type: 'video', url: 'https://fixtures.example.test/watch-on-source' };
  entries[5] = { ...entries[5], media_type: 'video', url: 'https://fixtures.example.test/video.mp4' };
  entries[6] = { ...entries[6], hdurl: 'javascript:window.injected=true', url: 'javascript:window.injected=true' };
  entries[7] = {
    ...entries[7], media_type: 'iframe', post_id: 125, url: 'https://science.nasa.gov/apod/vimeo-fixture/',
    basic_html: '<iframe src="https://player.vimeo.com/video/123456789"></iframe>'
  };
  entries[8] = {
    ...entries[8], hdurl: undefined, post_id: 126, url: 'https://science.nasa.gov/apod/html-image-fixture/',
    basic_html: `<img src="${imageUrl('html-only-image')}">`
  };
  return entries;
}

await test('NASA Space Explorer browser regression', { timeout: 120000 }, async (t) => {
  const server = await startServer();
  let browser;
  try {
    browser = await createBrowser();
    await browser.installScript(`(${installApiMock.toString()})();`);
    const interceptionErrors = [];
    browser.on('Fetch.requestPaused', ({ requestId, request }) => {
      const isImage = request.url.includes('fixtures.example.test') && request.url.endsWith('.svg');
      const body = isImage
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#163f86"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>'
        : '<!doctype html><title>Offline media fixture</title>';
      browser.command('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: isImage ? 'image/svg+xml' : 'text/html' }],
        body: Buffer.from(body).toString('base64')
      }).catch((error) => interceptionErrors.push(error));
    });
    await browser.command('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
    const evaluate = (expression) => browser.evaluate(expression);
    const requested = async () => new URL(await evaluate('__apodTest.requests.at(-1)'));
    let navigation = 0;
    const open = async (query = '') => {
      const url = new URL(`/${query}`, server.url);
      const token = String(++navigation);
      url.searchParams.set('testRun', token);
      await browser.navigate(url.href);
      await waitFor(browser, `window.__apodTest?.token === ${JSON.stringify(token)} && __apodTest.requests.length === 1 && document.readyState === 'complete'`);
    };
    const reply = async (body, status = 200) => {
      await evaluate(`__apodTest.reply(${JSON.stringify(body)}, ${status})`);
    };
    const ready = () => waitFor(browser, 'document.querySelectorAll(".gallery-item").length === 9 && document.getElementById("loadingMessage").hidden');
    const loadGallery = async (query = '') => {
      await open(query);
      const start = (await requested()).searchParams.get('start_date');
      const entries = entriesFor(start);
      await reply(entries);
      await ready();
      return entries;
    };
    const closeModal = async () => {
      await evaluate('document.getElementById("closeModal").click()');
      await waitFor(browser, '!document.getElementById("apodModal").open && document.getElementById("modalMedia").children.length === 0');
    };
    const openCard = async (index) => {
      await evaluate(`document.querySelectorAll('.gallery-item')[${index}].click()`);
      await waitFor(browser, 'document.getElementById("apodModal").open');
    };

    await t.test('loads nine consecutive dates with valid query params and a real loading state', async () => {
      await open();
      const request = await requested();
      assert.equal(request.origin + request.pathname, 'https://api.nasa.gov/planetary/apod');
      assert.equal(request.searchParams.get('api_key'), 'DEMO_KEY');
      assert.equal(request.searchParams.get('thumbs'), 'true');
      const start = request.searchParams.get('start_date');
      assert.equal(request.searchParams.get('end_date'), shift(start, 8));
      assert.deepEqual(await evaluate(`({loading:!loadingMessage.hidden,busy:gallery.getAttribute('aria-busy'),disabled:fetchButton.disabled,datesDisabled:startDate.disabled&&endDate.disabled,cards:gallery.children.length})`),
        { loading: true, busy: 'true', disabled: true, datesDisabled: true, cards: 0 });
      assert.ok((await evaluate('document.getElementById("spaceFact").textContent')).length > 25);
      const firstFact = await evaluate('document.getElementById("spaceFact").textContent');
      await evaluate('document.getElementById("newFactButton").click()');
      assert.notEqual(await evaluate('document.getElementById("spaceFact").textContent'), firstFact);
      await reply(entriesFor(start).reverse());
      await ready();
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".card-date")].map(date=>date.dateTime)'), Array.from({ length: 9 }, (_, i) => shift(start, i)));
      assert.equal(await evaluate('gallery.getAttribute("aria-busy")'), 'false');
      assert.equal(await evaluate('fetchButton.disabled || startDate.disabled || endDate.disabled'), false);
      assert.match(await evaluate('gallerySummary.textContent'), /9 discoveries/);
      assert.equal(await evaluate('document.querySelectorAll(".card-title").length'), 9);
      assert.equal(await evaluate('document.querySelectorAll(".gallery-item")[8].querySelector("img").src'), imageUrl('html-only-image'));
    });

    await t.test('modern HTML fields use full-resolution media and remain plain text', async () => {
      await openCard(1);
      assert.equal(await evaluate('modalTitle.textContent'), 'Modern & safe');
      assert.equal(await evaluate('modalExplanation.textContent'), 'A modern NASA explanation.');
      assert.equal(await evaluate('document.querySelector(".modal-image").src'), imageUrl('full-1'));
      assert.equal(await evaluate('Boolean(window.injected) || Boolean(document.querySelector("#modalTitle b, #modalExplanation em, #gallery script"))'), false);
      assert.equal(await evaluate('modalDate.dateTime'), (await requested()).searchParams.get('start_date') && shift((await requested()).searchParams.get('start_date'), 1));
      assert.match(await evaluate('modalCredit.textContent'), /NASA test fixture/);
      assert.equal(await evaluate('originalLink.href'), imageUrl('full-1'));
      await closeModal();
      assert.equal(await evaluate('document.activeElement === document.querySelectorAll(".gallery-item")[1]'), true);
    });

    await t.test('handles thumbnail videos, iframe entries, external videos, direct files, and unsafe media', async () => {
      assert.equal(await evaluate('document.querySelectorAll(".gallery-item")[2].querySelector("img").src'), imageUrl('video-thumbnail'));
      for (const index of [2, 3, 7]) {
        await openCard(index);
        const src = await evaluate('document.querySelector("#modalMedia iframe").src');
        assert.match(src, index === 7 ? /^https:\/\/player\.vimeo\.com\/video\/123456789$/ : /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk$/);
        assert.ok(await evaluate('document.querySelector("#modalMedia .media-link").href.startsWith("https://")'));
        await closeModal();
        assert.equal(await evaluate('document.querySelectorAll("#modalMedia iframe, #modalMedia video").length'), 0);
      }
      await openCard(4);
      assert.equal(await evaluate('document.querySelectorAll("#modalMedia iframe, #modalMedia video").length'), 0);
      assert.equal(await evaluate('document.querySelector("#modalMedia .media-link").href'), 'https://fixtures.example.test/watch-on-source');
      await closeModal();
      await openCard(5);
      assert.equal(await evaluate('document.querySelector("#modalMedia video").controls'), true);
      await closeModal();
      await openCard(6);
      assert.equal(await evaluate('document.querySelectorAll("#modalMedia img").length'), 0);
      assert.ok(await evaluate('originalLink.href.startsWith("https://apod.nasa.gov/apod/")'));
      assert.equal(await evaluate('Boolean(window.injected)'), false);
      await closeModal();
    });

    await t.test('supports keyboard opening, focus containment, Escape, and backdrop closing', async () => {
      await evaluate('document.querySelector(".gallery-item").focus()');
      assert.equal(await evaluate('document.activeElement === document.querySelector(".gallery-item")'), true);
      await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await waitFor(browser, 'apodModal.open');
      assert.equal(await evaluate('document.activeElement.id'), 'closeModal');
      await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
      await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate('document.activeElement.id'), 'originalLink', 'Shift+Tab wraps to the last modal control.');
      await evaluate('closeModal.focus()');
      for (let index = 0; index < 6; index++) {
        await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('apodModal.contains(document.activeElement)'), true,
          `Tab ${index + 1} focused ${await evaluate('document.activeElement.tagName + "#" + document.activeElement.id')}`);
      }
      await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await waitFor(browser, '!apodModal.open');
      assert.equal(await evaluate('document.activeElement === document.querySelector(".gallery-item")'), true);
      await openCard(0);
      await browser.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 });
      await browser.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 });
      await waitFor(browser, '!apodModal.open');
    });

    await t.test('keeps dates linked and validates empty, out-of-bounds, and short ranges', async () => {
      await evaluate(`startDate.value='2024-03-08'; startDate.dispatchEvent(new Event('change',{bubbles:true}))`);
      assert.equal(await evaluate('endDate.value'), '2024-03-16');
      await evaluate(`endDate.value='2024-11-06'; endDate.dispatchEvent(new Event('change',{bubbles:true}))`);
      assert.equal(await evaluate('startDate.value'), '2024-10-29');
      await evaluate(`startDate.value='1995-06-16'; startDate.dispatchEvent(new Event('change',{bubbles:true}))`);
      assert.equal(await evaluate('endDate.value'), '1995-06-24');
      const count = await evaluate('__apodTest.requests.length');
      for (const value of ['', '1995-06-15', '2099-01-01']) {
        await evaluate(`startDate.value=${JSON.stringify(value)}; dateForm.requestSubmit()`);
        assert.equal(await evaluate('__apodTest.requests.length'), count);
        assert.equal(await evaluate('startDate.validity.valid'), false);
      }
      await evaluate(`startDate.value='2024-02-01'; endDate.value='2024-02-05'; dateForm.requestSubmit()`);
      assert.equal(await evaluate('__apodTest.requests.length'), count);
      assert.match(await evaluate('errorText.textContent'), /nine consecutive days/);
      await evaluate(`startDate.value='2024-02-01'; endDate.value='2024-02-09'; dateForm.requestSubmit()`);
      assert.equal((await requested()).searchParams.get('start_date'), '2024-02-01');
      await reply(entriesFor('2024-02-01'));
      await ready();
      await evaluate('latestButton.click()');
      const latest = await requested();
      assert.equal(latest.searchParams.get('end_date'), await evaluate('endDate.max'));
      await reply(entriesFor(latest.searchParams.get('start_date')));
      await ready();
    });

    await t.test('detects NASA logo placeholders and requests the real NASA Science archive', async () => {
      await open();
      const start = (await requested()).searchParams.get('start_date');
      await reply(entriesFor(start).map((entry) => ({ ...entry, title: 'NASA Science', url: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png' })));
      await waitFor(browser, '__apodTest.requests.length === 2');
      const archive = await requested();
      assert.equal(archive.origin + archive.pathname, 'https://science.nasa.gov/wp-json/wp/v2/apod-basic');
      assert.equal(archive.searchParams.get('date_from'), start.replaceAll('-', '').slice(2));
      assert.equal(archive.searchParams.get('date_to'), shift(start, 8).replaceAll('-', '').slice(2));
      assert.equal(await evaluate('loadingMessage.hidden'), false);
      await reply(entriesFor(start));
      await ready();
      assert.match(await evaluate('gallerySummary.textContent'), /NASA Science archive/);
      assert.equal(await evaluate('document.querySelectorAll(".card-title")[1].textContent'), 'Modern & safe');
    });

    await t.test('shows useful HTTP errors and retry recovers the same range', async () => {
      for (const [status, pattern] of [[429, /request limit/], [401, /API key/], [403, /API key/], [500, /HTTP 500/]]) {
        await open();
        const start = (await requested()).searchParams.get('start_date');
        await reply({}, status);
        await waitFor(browser, '!errorMessage.hidden && loadingMessage.hidden');
        assert.match(await evaluate('errorText.textContent'), pattern);
        assert.equal(await evaluate('fetchButton.disabled'), false);
        assert.equal(await evaluate('document.querySelectorAll(".gallery-item").length'), 0);
        await evaluate('retryButton.click()');
        assert.equal((await requested()).searchParams.get('start_date'), start);
        await reply(entriesFor(start));
        await ready();
        assert.equal(await evaluate('errorMessage.hidden'), true);
      }
    });

    await t.test('handles malformed, incomplete, network, and timed-out responses', async () => {
      for (const kind of ['object', 'missing', 'duplicate', 'json', 'network']) {
        await open();
        const start = (await requested()).searchParams.get('start_date');
        const data = entriesFor(start);
        if (kind === 'object') await reply({ error: 'Unexpected shape' });
        if (kind === 'missing') await reply(data.slice(0, 8));
        if (kind === 'duplicate') await reply([...data.slice(0, 8), data[0]]);
        if (kind === 'json') await evaluate('__apodTest.malformed()');
        if (kind === 'network') await evaluate('__apodTest.fail()');
        await waitFor(browser, '!errorMessage.hidden && loadingMessage.hidden');
        assert.equal(await evaluate('document.querySelectorAll(".gallery-item").length'), 0);
        assert.equal(await evaluate('fetchButton.disabled || startDate.disabled || endDate.disabled'), false);
        assert.ok((await evaluate('errorText.textContent')).length > 20);
        if (kind === 'network') assert.match(await evaluate('errorText.textContent'), /internet connection/);
      }
      await open('?quickTimeout=1');
      await waitFor(browser, '!errorMessage.hidden && loadingMessage.hidden');
      assert.match(await evaluate('errorText.textContent'), /longer than expected/);
    });

    await t.test('saves a personal API key, restores it, and resets to DEMO_KEY', async () => {
      await loadGallery();
      await evaluate(`apiKey.value='fixture-personal-key'; apiKeyForm.requestSubmit(); dateForm.requestSubmit()`);
      assert.equal((await requested()).searchParams.get('api_key'), 'fixture-personal-key');
      assert.equal(await evaluate('apiKey.value'), '');
      await reply(entriesFor((await requested()).searchParams.get('start_date')));
      await ready();
      await open('?preserveStorage=1');
      assert.equal((await requested()).searchParams.get('api_key'), 'fixture-personal-key');
      await reply(entriesFor((await requested()).searchParams.get('start_date')));
      await ready();
      await evaluate(`apiKey.value=''; apiKeyForm.requestSubmit(); dateForm.requestSubmit()`);
      assert.equal((await requested()).searchParams.get('api_key'), 'DEMO_KEY');
      assert.equal(await evaluate('localStorage.getItem("nasa-space-explorer-api-key")'), null);
      await reply(entriesFor((await requested()).searchParams.get('start_date')));
      await ready();
    });

    await t.test('works when private browsing blocks localStorage', async () => {
      await loadGallery('?blockedStorage=1');
      assert.equal((await requested()).searchParams.get('api_key'), 'DEMO_KEY');
      await evaluate(`apiKey.value='session-only-key'; apiKeyForm.requestSubmit(); dateForm.requestSubmit()`);
      assert.equal((await requested()).searchParams.get('api_key'), 'session-only-key');
      assert.match(await evaluate('keyStatus.textContent'), /storage is unavailable/);
      await reply(entriesFor((await requested()).searchParams.get('start_date')));
      await ready();
    });

    await t.test('fits mobile, tablet, desktop, and modal without horizontal overflow', async () => {
      await loadGallery();
      for (const width of [375, 768, 1440]) {
        await browser.command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `Gallery overflows at ${width}px`);
        await openCard(0);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `Modal overflows at ${width}px`);
        // Dialog must stay inside the viewport; content may scroll vertically.
        assert.equal(await evaluate('apodModal.getBoundingClientRect().left >= 0 && apodModal.getBoundingClientRect().right <= innerWidth'), true);
        await closeModal();
        if (process.env.TEST_SCREENSHOT_DIR) {
          await mkdir(process.env.TEST_SCREENSHOT_DIR, { recursive: true });
          await evaluate('window.scrollTo(0, 0)');
          await browser.screenshot(resolve(process.env.TEST_SCREENSHOT_DIR, `gallery-${width}.png`));
        }
      }
      await browser.command('Emulation.clearDeviceMetricsOverride');
    });

    await t.test('zooms images smoothly on hover and respects reduced motion', async () => {
      await evaluate('document.querySelector(".gallery-item").scrollIntoView({block:"center"})');
      const { x, y } = await evaluate('(()=>{const r=document.querySelector(".gallery-item").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+40}})()');
      await browser.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await waitFor(browser, 'getComputedStyle(document.querySelector(".gallery-item img")).transform !== "none"');
      const duration = await evaluate('parseFloat(getComputedStyle(document.querySelector(".gallery-item img")).transitionDuration)');
      assert.ok(duration > 0, 'Hover zoom must use a transition.');
      await browser.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const reducedDuration = await evaluate('parseFloat(getComputedStyle(document.querySelector(".gallery-item img")).transitionDuration)');
      assert.ok(reducedDuration <= 0.01, 'Reduced motion must remove or minimize the transition.');
      await browser.command('Emulation.setEmulatedMedia', { features: [] });
      assert.deepEqual(interceptionErrors, []);
      const exceptions = browser.events.filter((event) => event.method === 'Runtime.exceptionThrown');
      assert.deepEqual(exceptions, [], 'No uncaught application errors.');
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});
