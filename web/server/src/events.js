// Live change notifications (Server-Sent Events), one stream per open app.
// Events only say *what* changed; clients then re-fetch with their normal API
// calls, so every rule (auth, validation, per-user data) stays in one place.

const MAX_STREAMS_PER_USER = 20;
const PING_MS = 25_000; // keeps proxies from closing an idle stream
const MAX_AGE_MS = 55 * 60_000; // tokens last 1h: make clients reconnect with a fresh one

export function createEvents({ pingMs = PING_MS, maxAgeMs = MAX_AGE_MS } = {}) {
  const streams = new Map(); // uid -> Set<stream>

  function close(stream) {
    if (stream.closed) return;
    stream.closed = true;
    clearInterval(stream.ping);
    clearTimeout(stream.expire);
    const set = streams.get(stream.uid);
    if (set) {
      set.delete(stream);
      if (!set.size) streams.delete(stream.uid);
    }
    try {
      stream.raw.end();
    } catch {
      /* already gone */
    }
  }

  function write(stream, text) {
    if (stream.closed) return;
    try {
      stream.raw.write(text);
    } catch {
      close(stream);
    }
  }

  return {
    /** Takes over a request and keeps it open as an event stream. */
    open(req, reply, uid, headers) {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
      });
      const stream = { uid, raw, closed: false };
      let set = streams.get(uid);
      if (!set) streams.set(uid, (set = new Set()));
      if (set.size >= MAX_STREAMS_PER_USER) close(set.values().next().value); // drop the oldest
      set.add(stream);
      stream.ping = setInterval(() => write(stream, ': ping\n\n'), pingMs);
      stream.expire = setTimeout(() => close(stream), maxAgeMs);
      req.raw.on('close', () => close(stream));
      raw.on('error', () => close(stream));
      write(stream, 'retry: 3000\n\nevent: ready\ndata: {}\n\n');
      return stream;
    },

    /** Tells every open app of this user what changed. `source` is the client that made the change. */
    publish(uid, change, source = null) {
      const set = streams.get(uid);
      if (!set) return;
      const text = `event: change\ndata: ${JSON.stringify({ ...change, source })}\n\n`;
      for (const stream of [...set]) write(stream, text);
    },

    count(uid) {
      return streams.get(uid)?.size ?? 0;
    },

    closeAll() {
      for (const set of [...streams.values()]) for (const s of [...set]) close(s);
    },
  };
}
