// Live sync: listens to /api/events and reports what changed on other devices.
// Uses fetch streaming (not EventSource) because the stream needs the
// Authorization header. Runs only while the tab is visible to save battery;
// on every (re)connect the app refreshes, so nothing is missed while away.

import { CLIENT_ID, authHeaders } from './api.js';

export function startLive({ onChange, onConnected }) {
  let stopped = false;
  let controller = null;
  let retryMs = 1000;
  let timer = null;

  function parse(block) {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    return { event, data };
  }

  async function connect() {
    if (stopped || document.hidden || controller) return;
    controller = new AbortController();
    const mine = controller;
    try {
      let res = await fetch('/api/events', { headers: await authHeaders(), signal: mine.signal, cache: 'no-store' });
      if (res.status === 401) {
        res.body?.cancel();
        res = await fetch('/api/events', { headers: await authHeaders(true), signal: mine.signal, cache: 'no-store' });
      }
      if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value.replace(/\r\n?/g, '\n');
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const { event, data } = parse(block);
          // A handler that throws must never take the stream down (it would reconnect forever).
          if (event === 'ready') {
            retryMs = 1000;
            try {
              onConnected();
            } catch (err) {
              console.error(err);
            }
          } else if (event === 'change') {
            let change = null;
            try {
              change = JSON.parse(data);
            } catch {
              /* ignore a malformed event */
            }
            try {
              if (change && change.source !== CLIENT_ID) onChange(change);
            } catch (err) {
              console.error(err);
            }
          }
        }
      }
    } catch {
      /* network drop, abort, or server restart: reconnect below */
    }
    if (controller === mine) controller = null;
    if (!stopped && !document.hidden) {
      clearTimeout(timer);
      timer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    }
  }

  function disconnect() {
    clearTimeout(timer);
    const c = controller;
    controller = null;
    c?.abort();
  }

  const onVisibility = () => {
    if (document.hidden) disconnect();
    else {
      retryMs = 1000;
      connect();
    }
  };
  const onOnline = () => {
    retryMs = 1000;
    disconnect();
    connect();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  connect();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    disconnect();
  };
}
