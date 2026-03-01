"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  title,
  size = "md",
  onClose,
  children
}: {
  open: boolean;
  title: string;
  size?: "md" | "lg" | "xl";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`card modal-panel modal-size-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
