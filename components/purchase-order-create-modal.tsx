"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { PurchaseOrderCreateForm } from "@/components/purchase-order-create-form";

type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string };

export function PurchaseOrderCreateModal({
  suppliers,
  products
}: {
  suppliers: Supplier[];
  products: Product[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nouveau BC
      </button>
      <Modal open={open} title="Nouveau bon de commande" size="xl" onClose={() => setOpen(false)}>
        <PurchaseOrderCreateForm suppliers={suppliers} products={products} embedded />
      </Modal>
    </>
  );
}
