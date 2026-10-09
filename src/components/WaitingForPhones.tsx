import { Smartphone } from "lucide-react";
import type { Waiting } from "../lib/room";
import "./waiting-for-phones.css";

const list = (items: string[]) =>
  items.length < 2 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const phones = (names: string[]) =>
  `${list(names.map((name) => `${name}’s`))} ${names.length > 1 ? "phones" : "phone"}`;

/** Covers the game while it waits on a player's phone, and says what to do. */
export default function WaitingForPhones({ waiting }: { waiting: Waiting[] }) {
  const named = (reason: Waiting["reason"]) =>
    waiting.filter((w) => w.reason === reason).map((w) => w.name);
  const away = named("away"),
    sideways = named("sideways"),
    recentering = named("recentering");
  return (
    <div className="phone-wait" role="status">
      {sideways.length > 0 && (
        <Smartphone className="phone-wait-icon" size={56} strokeWidth={1.6} aria-hidden="true" />
      )}
      <h2>Waiting for {list(waiting.map((w) => w.name))}</h2>
      {away.length > 0 && <p>Reconnect {phones(away)} to continue.</p>}
      {sideways.length > 0 && <p>Turn {phones(sideways)} upright to continue.</p>}
      {recentering.length > 0 && (
        <p>
          {list(recentering)}: point your phone at the screen, then tap{" "}
          <strong>Ready</strong>.
        </p>
      )}
    </div>
  );
}
