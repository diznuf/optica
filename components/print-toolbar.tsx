"use client";

export function PrintToolbar() {
  return (
    <div className="print-toolbar">
      <button className="btn" type="button" onClick={() => window.history.back()}>
        Retour
      </button>
      <button className="btn btn-primary" type="button" onClick={() => window.print()}>
        Imprimer
      </button>
    </div>
  );
}