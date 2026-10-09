// Phone and big screen connect directly (WebRTC via PeerJS). The free PeerJS
// broker only introduces them; game traffic goes device to device.
import { Peer, type DataConnection } from "peerjs";
export type { DataConnection };

// STUN servers let devices find a direct route to each other. When the network
// blocks that, Cloudflare TURN relays (from /api/ice) carry the connection.
const iceServers: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
let relays: Promise<void> | null = null;
/** Fetch relay credentials once; never wait more than a few seconds. */
export function loadRelays() {
  relays ??= Promise.race([
    fetch("/api/ice")
      .then((r) => (r.ok ? r.json() : { iceServers: [] }))
      .then((data: { iceServers?: RTCIceServer[] }) => {
        iceServers.push(...(data.iceServers ?? []));
      })
      .catch(() => {}),
    new Promise<void>((done) => setTimeout(done, 3000)),
  ]);
  return relays;
}
export const createPeer = (id?: string) => {
  const config = { iceServers: [...iceServers] };
  return id ? new Peer(id, { config }) : new Peer({ config });
};

// The big screen registers under this ID so a phone can find it by room code.
export const roomPeerId = (code: string) => `mobile-console-room-${code}`;

export const newRoomCode = () =>
  String(100000 + Math.floor(Math.random() * 900000));

export const connectOptions = { reliable: true, serialization: "json" } as const;

/** Calls back once if the direct connection is refused by the network. */
export function onDirectFailure(conn: DataConnection, fail: () => void) {
  const pc = conn.peerConnection;
  if (!pc) return;
  const check = () => {
    if (pc.iceConnectionState === "failed" || pc.connectionState === "failed")
      fail();
  };
  pc.addEventListener("iceconnectionstatechange", check);
  pc.addEventListener("connectionstatechange", check);
}

export const BLOCKED_MESSAGE =
  "Found the big screen, but this network blocked a direct connection. Put both devices on the same home Wi-Fi (not a guest or work network) and turn off any VPN.";
