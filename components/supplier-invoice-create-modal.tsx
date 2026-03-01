"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { SupplierInvoiceCreateForm } from "@/components/supplier-invoice-create-form";

type Supplier = { id: string; code: string; name: string; paymentTermsDays: number };
type Product = { id: string; sku: string; name: string };
type PurchaseOrderOption = {
  id: string;
  number: string;
  supplierId: string;
  items: Array<{
    productId: string;
    productName: string;
    remainingQty: number;
    unitCost: number;
  }>;
};

export function SupplierInvoiceCreateModal({
  suppliers,
  products,
  purchaseOrders
}: {
  suppliers: Supplier[];
  products: Product[];
  purchaseOrders: PurchaseOrderOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nouvelle facture
      </button>
      <Modal open={open} title="Nouvelle facture fournisseur" size="xl" onClose={() => setOpen(false)}>
        <SupplierInvoiceCreateForm suppliers={suppliers} products={products} purchaseOrders={purchaseOrders} embedded />
      </Modal>
    </>
  );
}
