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
          {playing ? "Reconnect your phone." : "Your phone is the controller."}
        </h1>
        <p>
          {playing
            ? "Your game is paused until your phone reconnects."
            : "Keep this screen in view. Play with your phone."}
        </p>
        <ol className="welcome-steps">
          <li>
            <span>1.</span>
            <div>
              <strong>Scan the QR code</strong> using your phone's camera.
            </div>
          </li>
          <li>
            <span>2.</span>
            <div>
              <strong>Tap “Enable motion”</strong> on your phone.
            </div>
          </li>
          <li>
            <span>3.</span>
            <div>
              <strong>Choose a game</strong> on this screen and start playing.
            </div>
          </li>
        </ol>
      </section>
      <section
        className="welcome-connect"
        aria-label="Connect your motion controller"
      >
        <PairingPanel
          room={room}
          onContinue={onContinue}
          continueLabel={playing ? "Return to game" : "Choose a game"}
        />
      </section>
    </main>
  );
}
