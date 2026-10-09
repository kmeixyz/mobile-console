// Phone and big screen connect directly (WebRTC via PeerJS). The free PeerJS
// broker only introduces them; game traffic goes device to device.
import { Peer, type DataConnection } from "peerjs";
export type { DataConnection };

// STUN servers let devices find a direct route to each other. When the network
// blocks that, phones fall back to the Supabase relay (relay.ts).
const config = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};
export const createPeer = (id?: string) =>
  id ? new Peer(id, { config }) : new Peer({ config });

// The big screen registers under this ID so a phone can find it by room code.
export const roomPeerId = (code: string) => `mobile-console-room-${code}`;

export const newRoomCode = () =>
  String(100000 + Math.floor(Math.random() * 900000));

export const connectOptions = { reliable: true, serialization: "json" } as const;

/** Calls back once if the direct connection is refused by the network. */
export function onDirectFailure(
  conn: { peerConnection?: RTCPeerConnection },
  fail: () => void,
) {
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
  "Couldn’t reach the big screen. Check your internet.";
