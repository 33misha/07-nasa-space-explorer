// Small Chrome DevTools Protocol driver: no npm packages or browser downloads.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join, delimiter } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');

export async function startServer() {
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      // Serve only application assets, never credentials or repository metadata.
      if (!/^(index\.html|style\.css|js\/[\w.-]+\.js|img\/[\w./-]+)$/.test(relative) || relative.includes('..')) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(resolve(projectRoot, relative));
      response.writeHead(200, { 'Content-Type': mime[extname(relative)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function browserPath() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) throw new Error('CHROME_PATH does not point to a browser executable.');
    return process.env.CHROME_PATH;
  }
  const names = process.platform === 'win32' ? ['chrome.exe', 'msedge.exe'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...(process.env.PATH || '').split(delimiter).flatMap((directory) => names.map((name) => join(directory, name)))
  ];
  const path = paths.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('Install Chrome/Chromium/Edge or set CHROME_PATH to its executable.');
  return path;
}

export async function createBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'nasa-explorer-browser-'));
  const child = spawn(browserPath(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { cwd: profile, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Browser launch timeout: ${output}`)), 15000);
      child.on('error', (error) => { clearTimeout(timeout); reject(error); });
      child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Browser exited ${code}: ${output}`)); });
      child.stderr.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser DevTools connection timeout.')), 10000);
      socket.onopen = () => { clearTimeout(timeout); resolve(); };
      socket.onerror = (error) => { clearTimeout(timeout); reject(error); };
    });
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();
    const events = [];
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timed out: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const item = pending.get(message.id);
        pending.delete(message.id);
        if (!item) return;
        clearTimeout(item.timeout);
        if (message.error) item.reject(new Error(JSON.stringify(message.error)));
        else item.resolve(message.result);
      } else {
        events.push(message);
        for (const listener of listeners.get(message.method) || []) listener(message.params);
      }
    };
    socket.onclose = () => {
      for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error('Browser DevTools closed.')); }
      pending.clear();
    };
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Page.bringToFront');
    return {
      command, events,
      on(method, listener) { listeners.set(method, [...(listeners.get(method) || []), listener]); },
      navigate: (url) => command('Page.navigate', { url }),
      installScript: (source) => command('Page.addScriptToEvaluateOnNewDocument', { source }),
      async evaluate(expression) {
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      },
      async screenshot(path) {
        const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        await writeFile(path, Buffer.from(data, 'base64'));
      },
      async close() {
        await Promise.race([send('Browser.close'), new Promise((resolve) => setTimeout(resolve, 1000))]).catch(() => {});
        socket.close();
        if (child.exitCode === null) {
          await new Promise((resolve) => {
            const timeout = setTimeout(() => { child.kill(); resolve(); }, 1000);
            child.once('exit', () => { clearTimeout(timeout); resolve(); });
          });
        }
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
      }
    };
  } catch (error) {
    socket?.close();
    child.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    throw error;
  }
}

export async function waitFor(browser, expression, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await browser.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
