import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";

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
      <h2 ref={heading} tabIndex={-1}>
        Your turn, {name}.
      </h2>
      {detail && <p className="handoff-detail">{detail}</p>}
      <p>
        {onReady
          ? "Tap when you’re ready."
          : `${name}, tap I’m ready, then Ready on your phone.`}
      </p>
      {onReady && (
        <button
          className="primary-button"
          disabled={disabled}
          onClick={onReady}
        >
          I’m ready <ArrowRight size={18} />
        </button>
      )}
    </section>
  );
}
