/** A signaling outage does not mean the device-to-device game link is down. */
export function hasLiveLink(link) {
  if (!link?.open) return false;
  const state = link.peerConnection?.connectionState;
  return state !== "closed" && state !== "failed";
}

/** Allow delayed packets to arrive in a burst without kicking a real phone. */
export function controlBudget(now = Date.now()) {
  let tokens = 1000, last = now;
  return time => {
    tokens = Math.min(1000, tokens + Math.max(0, time - last) * .25);
    last = time;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

/** Keep only the newest aim when the direct data channel is congested. */
export function controlSender(getLink) {
  let pending = new Map(), timer = null;
  const flush = () => {
    timer = null;
    const link = getLink();
    if (!link?.open) { pending.clear(); return; }
    if ((link.dataChannel?.bufferedAmount ?? 0) > 16384) {
      timer = setTimeout(flush, 16);
      return;
    }
    for (const message of pending.values()) link.send(message);
    pending.clear();
  };
  return {
    send(action, value) {
      const link = getLink();
      if (!link?.open) return;
      const message = { type: "control", action, value };
      if (action === "aim" || action === "move") {
        pending.set(action, message);
        if (!timer) timer = setTimeout(flush, 0);
      } else {
        // Commit the latest aim before a press/release, preserving wire order.
        if (timer) clearTimeout(timer);
        timer = null;
        for (const aim of pending.values()) link.send(aim);
        pending.clear();
        link.send(message);
      }
    },
    clear() { if (timer) clearTimeout(timer); timer = null; pending.clear(); },
  };
}
