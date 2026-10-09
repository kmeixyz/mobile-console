import { PairingPanel } from "./Pairing";
import type { useRoom } from "../lib/room";
export default function PhoneWelcome({
  room,
  playing,
  onContinue,
}: {
  room: ReturnType<typeof useRoom>;
  playing: boolean;
  onContinue: () => void;
}) {
  return (
    <main id="connect-main" className="phone-welcome">
      <section className="phone-welcome-copy">
        <h1 tabIndex={-1}>
          {playing
            ? "Reconnect your phone."
            : (
              // Fixed break so the heading's box hugs its text, keeping the
              // desktop layout centered.
              <>
                Got a phone and
                <br />
                ready to play?
              </>
            )}
        </h1>
        <p>
          {playing
            ? "Your game is paused until your phone reconnects."
            : "Scan the QR code to join the game."}
        </p>
      </section>
      <section
        className="welcome-connect"
        aria-label="Connect your motion controller"
      >
        <PairingPanel
          room={room}
          onContinue={onContinue}
          continueLabel={playing ? "Return to game" : "Play"}
        />
      </section>
    </main>
  );
}
