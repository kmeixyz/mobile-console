// Backup connection for networks that block phones from reaching the big
// screen directly (school, office, hotel, and guest Wi-Fi). Messages travel
// through Supabase Realtime instead: each relayed phone gets its own channel
// with the big screen, found through a shared channel named after the room.
//
// Supabase's free plan allows about 2 million messages a month and 100 a
// second per project, so phones send at most ~15 batched updates a second.
import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";

// Both values are public by design; Supabase only accepts what the project's
// settings allow (here: broadcast messages on public channels, no tables).
const SUPABASE_URL = "https://ymndaadrpwhpzjwjcujc.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0p6Q7ttcZA-2YiwAElf3g_zls1RQLB";
const SEND_EVERY = 66;
const HELLO_EVERY = 1500;
const JOIN_TIMEOUT = 9000;
// The big screen answers pings; a relayed phone that hears nothing for this
// long has lost the big screen.
const SILENCE_LIMIT = 20000;

/** What the room and the phone need from a connection, direct or relayed. */
export type Link = {
  connectionId: string;
  open: boolean;
  relayed?: boolean;
  peerConnection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  metadata?: { resumeId?: string };
  send(data: unknown): void;
  close(): void;
  on(event: "open" | "data" | "close" | "error", callback: (arg?: unknown) => void): void;
};
type Events = "open" | "data" | "close" | "error";

let client: RealtimeClient | null = null;
const realtime = () =>
  (client ??= new RealtimeClient(`${SUPABASE_URL.replace(/^http/, "ws")}/realtime/v1`, {
    params: { apikey: SUPABASE_KEY },
  }));
const lobbyTopic = (code: string) => `mobile-console:${code}`;
const phoneTopic = (code: string, id: string) => `mobile-console:${code}:${id}`;
const channel = (topic: string) =>
  realtime().channel(topic, { config: { broadcast: { self: false } } });
const subscribed = (ch: RealtimeChannel) =>
  new Promise<void>((resolve, reject) =>
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status !== "CLOSED") reject(new Error(status));
    }),
  );
const broadcast = (ch: RealtimeChannel, event: string, payload: unknown) =>
  ch.send({ type: "broadcast", event, payload }).catch(() => {});

// Messages that arrive before anyone listens (the big screen's first reply)
// are held and delivered to the first listener.
function emitter() {
  const listeners = new Map<Events, ((arg?: unknown) => void)[]>();
  const early: unknown[] = [];
  return {
    on(event: Events, callback: (arg?: unknown) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), callback]);
      if (event === "data") early.splice(0).forEach((arg) => callback(arg));
    },
    emit(event: Events, arg?: unknown) {
      const list = listeners.get(event);
      if (!list?.length && event === "data") early.push(arg);
      list?.forEach((callback) => callback(arg));
    },
  };
}

/**
 * Big screen: accept relayed phones for this room. Each becomes a Link handed
 * to onPhone, already open. Returns a function that stops relaying.
 */
export function hostRelay(code: string, onPhone: (link: Link) => void) {
  const links = new Map<string, Link>();
  const lobby = channel(lobbyTopic(code));
  let stopped = false;
  lobby.on("broadcast", { event: "hello" }, async ({ payload }) => {
    const id = String((payload as { id?: unknown })?.id ?? "");
    if (stopped || !/^[a-z0-9]{12}$/.test(id) || links.has(id)) return;
    const ch = channel(phoneTopic(code, id));
    const events = emitter();
    const link: Link = {
      connectionId: `relay-${id}`,
      metadata: { resumeId: String(payload.session || "") },
      open: false,
      relayed: true,
      send: (data) => link.open && broadcast(ch, "down", data),
      close() {
        if (!links.has(id)) return;
        links.delete(id);
        link.open = false;
        realtime().removeChannel(ch);
        events.emit("close");
      },
      on: events.on,
    };
    links.set(id, link);
    ch.on("broadcast", { event: "up" }, ({ payload }) => {
      const items = (payload as { items?: unknown })?.items;
      if (link.open && Array.isArray(items))
        items.slice(0, 20).forEach((item) => events.emit("data", item));
    });
    try {
      await subscribed(ch);
    } catch {
      links.delete(id);
      realtime().removeChannel(ch);
      return;
    }
    if (stopped) return link.close();
    onPhone(link);
    link.open = true;
    events.emit("open");
  });
  subscribed(lobby).catch(() => {});
  return () => {
    stopped = true;
    links.forEach((link) => link.close());
    realtime().removeChannel(lobby);
  };
}

/**
 * Phone: reach the big screen through the relay. Resolves with an open Link
 * once the big screen answers, or rejects if no room answers in time.
 */
export async function joinRelay(code: string, session = ""): Promise<Link> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) =>
    "abcdefghijklmnopqrstuvwxyz0123456789"[n % 36],
  ).join("");
  const ch = channel(phoneTopic(code, id));
  const events = emitter();
  let queue: Record<string, unknown>[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let heard = Date.now();
  let watch: ReturnType<typeof setInterval> | null = null;
  const flush = () => {
    flushTimer = null;
    if (!queue.length || !link.open) return;
    broadcast(ch, "up", { items: queue });
    queue = [];
  };
  const link: Link = {
    connectionId: `relay-${id}`,
    open: false,
    relayed: true,
    // Batched: aim updates arrive ~60 times a second; only the latest of each
    // goes out with each batch, everything else in order.
    send(data) {
      if (!link.open || !data || typeof data !== "object") return;
      const message = data as Record<string, unknown>;
      const steer =
        message.type === "control" &&
        (message.action === "aim" || message.action === "move");
      if (steer)
        queue = queue.filter(
          (m) => !(m.type === "control" && m.action === message.action),
        );
      queue.push(message);
      if (message.type === "leave" || (message.type === "control" && !steer)) {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
      }
      else flushTimer ??= setTimeout(flush, SEND_EVERY);
    },
    // Says goodbye first: unlike a direct connection, the big screen can't
    // see a relayed phone go.
    close() {
      if (!link.open) return;
      link.open = false;
      if (flushTimer) clearTimeout(flushTimer);
      if (watch) clearInterval(watch);
      broadcast(ch, "up", { items: [...queue, { type: "leave" }] }).finally(() =>
        realtime().removeChannel(ch),
      );
      queue = [];
      events.emit("close");
    },
    on: events.on,
  };
  const answered = new Promise<void>((resolve) =>
    ch.on("broadcast", { event: "down" }, ({ payload }) => {
      heard = Date.now();
      resolve();
      if (link.open) events.emit("data", payload);
    }),
  );
  await subscribed(ch);
  const lobby = channel(lobbyTopic(code));
  let hello: ReturnType<typeof setInterval> | null = null;
  try {
    await subscribed(lobby);
    // Open before the reply arrives, so the "joined" message is delivered.
    link.open = true;
    const sayHello = () => broadcast(lobby, "hello", { id, session });
    sayHello();
    hello = setInterval(sayHello, HELLO_EVERY);
    await Promise.race([
      answered,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("no answer")), JOIN_TIMEOUT),
      ),
    ]);
  } catch (error) {
    link.open = false;
    realtime().removeChannel(ch);
    throw error;
  } finally {
    if (hello) clearInterval(hello);
    realtime().removeChannel(lobby);
  }
  watch = setInterval(() => {
    if (Date.now() - heard > SILENCE_LIMIT) link.close();
  }, 5000);
  return link;
}
