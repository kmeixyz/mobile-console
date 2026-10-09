import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
export default function Dialog({
  title,
  children,
  onClose,
  className = "",
  onBack,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const previous = document.activeElement as HTMLElement;
    d.showModal();
    d.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="sheet-content">
        <div className="sheet-handle" />
        {onBack && (
          <button className="text-button sheet-back" onClick={onBack}>
            <ChevronLeft size={18} /> Back to game menu
          </button>
        )}
        <header className="sheet-header">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
