"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { ProductCreateForm } from "@/components/product-create-form";
import { StockInputForm } from "@/components/stock-input-form";

type Category = { id: string; name: string };
type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string };

export function StockCreateModals({
  categories,
  suppliers,
  stockInputProducts
}: {
  categories: Category[];
  suppliers: Supplier[];
  stockInputProducts: Product[];
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setProductOpen(true)}>
        Nouveau produit
      </button>
      <button className="btn" type="button" onClick={() => setStockOpen(true)}>
        Entree stock rapide
      </button>
      <Modal open={productOpen} title="Nouveau produit" size="xl" onClose={() => setProductOpen(false)}>
        <ProductCreateForm categories={categories} suppliers={suppliers} embedded />
      </Modal>
      <Modal open={stockOpen} title="Entree stock rapide" size="lg" onClose={() => setStockOpen(false)}>
        <StockInputForm products={stockInputProducts} embedded />
      </Modal>
    </>
  );
}
