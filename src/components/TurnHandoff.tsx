import { useEffect, useRef } from "react";
import { ArrowRight, Smartphone } from "lucide-react";

export default function TurnHandoff({
  name,
  detail,
  onReady,
  disabled = false,
}: {
  name: string;
  detail?: string;
  onReady?: () => void;
  disabled?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [name]);
  return (
    <section className="turn-handoff" aria-label="Next player">
      <p className="overlay-eyebrow">Up next</p>
      <h2 ref={heading} tabIndex={-1} aria-label={`Your turn, ${name}.`}>
        {name}
      </h2>
      {detail && <p className="handoff-detail">{detail}</p>}
      {onReady ? (
        <button
          className="primary-button"
          disabled={disabled}
          onClick={onReady}
        >
          I’m ready <ArrowRight size={18} />
        </button>
      ) : (
        <p className="ready-instruction">
          <span className="ready-step">
            <Smartphone aria-hidden="true" />
            Tap
          </span>
          <strong className="phone-key is-go">I’m ready</strong>
        </p>
      )}
    </section>
  );
}
