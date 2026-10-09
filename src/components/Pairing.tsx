import { useLayoutEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ArrowRight } from "lucide-react";
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
  return (
    <>
      {room.paired ? (
        <div className="paired-success">
          <ul
            className={`connected-players ${room.players.length > 1 ? "many" : ""}`}
            aria-label="Connected players"
          >
            {room.players.map((p) => (
              <li key={p.id} className={p.name && p.motionReady ? "" : "pending"}>
                <span>{p.name || p.device || "New player"}</span>
                <button
                  className="text-button"
                  onClick={() => room.removePhone(p.id)}
                  aria-label={`Remove ${p.name || "this phone"}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {room.players.some((p) => !p.name || !p.motionReady) && (
            <p>
              {room.players.some((p) => !p.name)
                ? "Enter a name on each phone, then tap Enable motion."
                : "Tap Enable motion on each phone and allow access."}
            </p>
          )}
          <button
            className="primary-button"
            onClick={onContinue}
            disabled={!room.motionReady}
          >
            {continueLabel} <ArrowRight size={18} />
          </button>
          {room.code && room.players.length < MAX_PHONES && (
            <div className="add-phone">
              <QRCodeSVG
                value={link}
                size={96}
                level="M"
                bgColor="transparent"
                title="Scan to add another phone"
              />
              <p>
                Add another phone
                <strong>
                  {room.code.slice(0, 3)} {room.code.slice(3)}
                </strong>
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="pair-qr">
            {room.code ? (
              <QRCodeSVG
                value={link}
                size={172}
                level="M"
                bgColor="transparent"
                title="Scan to connect your phone to this Mobile Console"
              />
            ) : (
              <span
                className="spinner"
                role="status"
                aria-label="Creating your room"
              />
            )}
          </div>
          {room.code && (
            <>
              <p className="code-label">Or enter this code</p>
              <p className="room-code">
                {room.code.slice(0, 3)} <span>{room.code.slice(3)}</span>
              </p>
            </>
          )}
          {room.error && (
            <p className="error-message" role="alert">
              {room.error}
            </p>
          )}
          {room.code ? (
            <button
              className="secondary-button full-width"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopied(false);
                  setCopyError(true);
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "Link copied" : "Copy link"}
            </button>
          ) : room.connecting ? (
            <button className="secondary-button full-width" disabled>
              <Copy size={17} /> Copy link
            </button>
          ) : (
            <button className="primary-button full-width" onClick={room.create}>
              Try again
            </button>
          )}
          {copyError && (
            <p className="helper-text" role="status">
              Copy failed. Use this link: <a href={link}>{link}</a>
            </p>
          )}
          <a className="text-button join-own" href="/?join=">
            On a phone? Enter a code <ArrowRight size={16} />
          </a>
        </>
      )}
    </>
  );
}
