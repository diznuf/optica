import { Prisma, SequenceType } from "@prisma/client";
import { db } from "@/lib/db";

const prefixes: Record<SequenceType, string> = {
  ORDER: "CMD",
  DELIVERY_NOTE: "BL",
  INVOICE: "FAC",
  RECEIPT: "RCP",
  PURCHASE_ORDER: "BC",
  SUPPLIER_INVOICE: "FAF",
  SUPPLIER_RETURN: "RET",
  PATIENT: "PAT",
  SUPPLIER: "FRN",
  PRODUCT: "PRD"
};

export async function nextSequence(type: SequenceType, tx?: Prisma.TransactionClient): Promise<string> {
  const client = tx ?? db;
  const sequence = await client.sequence.upsert({
    where: { type },
    create: { type, currentValue: 1 },
    update: { currentValue: { increment: 1 } }
  });

  return `${prefixes[type]}-${String(sequence.currentValue).padStart(6, "0")}`;
}
