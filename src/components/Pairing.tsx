import { useLayoutEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ArrowRight, X } from "lucide-react";
import Dialog from "./Dialog";
import { MAX_PHONES, type useRoom } from "../lib/room";
export default function Pairing({
  room,
  onClose,
  onBack,
  playing = false,
}: {
  room: ReturnType<typeof useRoom>;
  onClose: () => void;
  onBack?: () => void;
  playing?: boolean;
}) {
  return (
    <Dialog
      title={room.paired ? "Your phone" : "Connect a phone"}
      onBack={onBack}
      onClose={onClose}
      className="pair-sheet"
    >
      <PairingPanel
        room={room}
        onContinue={onClose}
        continueLabel={playing ? "Return to game" : "Done"}
      />
    </Dialog>
  );
}
export function PairingPanel({
  room,
  onContinue,
  continueLabel,
}: {
  room: ReturnType<typeof useRoom>;
  onContinue: () => void;
  continueLabel: string;
}) {
  const [url, setUrl] = useState(location.origin);
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);
  // Start before first paint so the loading state shows instead of a flash of "Try again".
  useLayoutEffect(() => {
    room.create();
    fetch("/api/network")
      .then((r) => r.json())
      .then((data) => setUrl(data.url))
      .catch(() => {});
  }, [room.create]);
  const link = `${url}/?join=${room.code}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };
  const copyButton = (
    <button className="secondary-button full-width" onClick={copyLink}>
      {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
  const copyFallback = copyError && (
    <p className="helper-text" role="status">
      Copy failed. Use this link: <a href={link}>{link}</a>
    </p>
  );
  return (
    <>
      {room.paired ? (
        <div className="paired-success">
          <ul
            className="connected-players"
            aria-label="Players"
            aria-live="polite"
          >
            {room.players.map((p, index) => {
              // Demo mode's mouse "phone" has no typed name but is ready.
              const ready = (!!p.name || !!import.meta.env.VITE_DEMO) && p.motionReady;
              return (
              <li key={p.id} className={ready && !p.quiet ? "" : "pending"}>
                <span className="connected-player-name">
                  {p.name || `Player ${index + 1}`}
                </span>
                <span className="connected-player-divider" aria-hidden="true" />
                <span className="connected-player-status">
                  {p.quiet
                    ? "Reconnecting…"
                    : ready
                      ? "Connected"
                      : "Connecting…"}
                </span>
                <button
                  className="remove-player"
                  onClick={() => room.removePhone(p.id)}
                  aria-label={`Remove ${p.name || `Player ${index + 1}`}`}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
              );
            })}
          </ul>
          <button
            className="primary-button"
            onClick={onContinue}
            disabled={!room.motionReady}
          >
            {continueLabel} <ArrowRight size={18} />
          </button>
          {room.code && room.players.length < MAX_PHONES && (
            <div className="add-phone">
              <div className="pair-qr">
                <QRCodeSVG
                  value={link}
                  size={320}
                  marginSize={4}
                  level="M"
                  bgColor="#ffffff"
                  title="Scan to add another phone"
                />
              </div>
              <div className="add-phone-code">
                <p>
                  Or enter this code
                  <strong>
                    {room.code.slice(0, 3)} {room.code.slice(3)}
                  </strong>
                </p>
                {copyButton}
                {copyFallback}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="pair-qr">
            {room.code ? (
              <QRCodeSVG
                value={link}
                size={400}
                marginSize={2}
                level="M"
                bgColor="#ffffff"
                title="Scan to connect your phone to this Mobile Console"
              />
            ) : (
              // A blank card and placeholder code hold the layout until the
              // room is ready, so nothing jumps when the code arrives.
              <span
                role="status"
                aria-label="Creating your room"
              />
            )}
          </div>
          <p className="code-label">Or enter this code</p>
          {room.code ? (
            <p className="room-code">
              {room.code.slice(0, 3)} <span>{room.code.slice(3)}</span>
            </p>
          ) : (
            <p className="room-code pending" aria-hidden="true">
              ??? <span>???</span>
            </p>
          )}
          {room.error && (
            <p className="error-message" role="alert">
              {room.error}
            </p>
          )}
          {room.code ? (
            copyButton
          ) : room.connecting ? (
            <button className="secondary-button full-width" disabled>
              <Copy size={17} /> Copy link
            </button>
          ) : (
            <button className="primary-button full-width" onClick={room.create}>
              Try again
            </button>
          )}
          {copyFallback}
          <a className="text-button join-own" href="/?join=">
            On a phone? Enter a code <ArrowRight size={16} />
          </a>
        </>
      )}
    </>
  );
}
