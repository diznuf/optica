"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { SupplierCreateForm } from "@/components/supplier-create-form";

export function SupplierCreateModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nouveau fournisseur
      </button>
      <Modal open={open} title="Nouveau fournisseur" size="lg" onClose={() => setOpen(false)}>
        <SupplierCreateForm embedded />
      </Modal>
    </>
  );
}
