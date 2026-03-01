import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { OrderActions } from "@/components/order-actions";
import { OrderPaymentCancelButton } from "@/components/order-payment-cancel-button";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

type EyeSnapshot = {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
};

type PrescriptionSnapshot = {
  id: string | null;
  examDate: string | null;
  od: EyeSnapshot;
  os: EyeSnapshot;
  pdFar: number | null;
  pdNear: number | null;
  prism: string | null;
  notes: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseEyeSnapshot(value: unknown): EyeSnapshot {
  if (!isRecord(value)) {
    return { sph: null, cyl: null, axis: null, add: null };
  }

  return {
    sph: toNullableNumber(value.sph),
    cyl: toNullableNumber(value.cyl),
    axis: toNullableNumber(value.axis),
    add: toNullableNumber(value.add)
  };
}

function parsePrescriptionSnapshot(value: Prisma.JsonValue | null): PrescriptionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const snapshot: PrescriptionSnapshot = {
    id: toNullableText(value.id),
    examDate: toNullableText(value.examDate),
    od: parseEyeSnapshot(value.od),
    os: parseEyeSnapshot(value.os),
    pdFar: toNullableNumber(value.pdFar),
    pdNear: toNullableNumber(value.pdNear),
    prism: toNullableText(value.prism),
    notes: toNullableText(value.notes)
  };

  const hasEyeValue = [snapshot.od.sph, snapshot.od.cyl, snapshot.od.axis, snapshot.od.add, snapshot.os.sph, snapshot.os.cyl, snapshot.os.axis, snapshot.os.add].some(
    (entry) => entry !== null
  );
  const hasAnyValue =
    snapshot.id !== null ||
    snapshot.examDate !== null ||
    hasEyeValue ||
    snapshot.pdFar !== null ||
    snapshot.pdNear !== null ||
    snapshot.prism !== null ||
    snapshot.notes !== null;

  return hasAnyValue ? snapshot : null;
}

function formatEye(eye: EyeSnapshot) {
  return `${eye.sph ?? "-"} / ${eye.cyl ?? "-"} / ${eye.axis ?? "-"} / Add ${eye.add ?? "-"}`;
}

function formatExamDate(input: string | null) {
  if (!input) {
    return "-";
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return input;
  }
  return parsed.toISOString().slice(0, 10);
}

function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function orderStatusClass(status: string) {
  switch (status) {
    case "BROUILLON":
      return "draft";
    case "CONFIRMEE":
      return "confirmed";
    case "EN_ATELIER":
      return "workshop";
    case "PRETE":
      return "ready";
    case "LIVREE":
      return "delivered";
    case "ANNULEE":
      return "cancelled";
    default:
      return "draft";
  }
}

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const canWriteOrder = ["ADMIN", "OPTICIEN", "VENDEUR"].includes(session.role);
  const canCancelPayments = session.role === "ADMIN";
  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      patient: true,
      createdBy: { select: { displayName: true } },
      items: true,
      payments: true,
      deliveryNotes: true,
      invoices: true,
      receipts: true
    }
  });

  if (!order) {
    notFound();
  }

  const snapshotGroups = (() => {
    const groups = new Map<string, { snapshot: PrescriptionSnapshot; lines: string[] }>();
    for (const item of order.items) {
      const snapshot = parsePrescriptionSnapshot(item.prescriptionSnapshotJson);
      if (!snapshot) {
        continue;
      }

      const signature = JSON.stringify(snapshot);
      const existing = groups.get(signature);
      if (!existing) {
        groups.set(signature, { snapshot, lines: [item.descriptionSnapshot] });
        continue;
      }
      existing.lines.push(item.descriptionSnapshot);
    }
    return Array.from(groups.values());
  })();
  const paymentTotal = Number(order.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
  const paymentConsistent = Math.abs(paymentTotal - order.paidAmount) <= 0.01;
  const documentRows = [
    ...order.deliveryNotes.map((doc) => ({
      id: doc.id,
      number: doc.number,
      type: "Bon livraison",
      date: doc.deliveredAt,
      href: `/print/delivery-note/${doc.id}`
    })),
    ...order.invoices.map((doc) => ({
      id: doc.id,
      number: doc.number,
      type: "Facture",
      date: doc.issuedAt,
      href: `/print/invoice/${doc.id}`
    })),
    ...order.receipts.map((doc) => ({
      id: doc.id,
      number: doc.number,
      type: "Recu",
      date: doc.issuedAt,
      href: `/print/receipt/${doc.id}`
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <AppShell session={session} title={`Commande ${order.number}`}>
      <section className="detail-header">
        <div className="detail-header-main">
          <h2>
            {order.patient.firstName} {order.patient.lastName}
          </h2>
          <p>Commande {order.number}</p>
        </div>
        <div className="page-actions">
          <Link href="/orders" className="btn">
            Retour commandes
          </Link>
          <Link href={`/patients/${order.patientId}`} className="btn">
            Ouvrir patient
          </Link>
        </div>
      </section>

      <section className="grid grid-3 metrics-grid">
        <article className="card metric-card">
          <div className="metric-label">Statut</div>
          <strong className="metric-value">
            <span className={`badge order-status-badge ${orderStatusClass(order.status)}`}>{order.status}</span>
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Total / Solde</div>
          <strong className="metric-value">
            {formatDZD(order.totalAmount)} / {formatDZD(order.balance)}
          </strong>
        </article>
        <article className="card metric-card">
          <div className="metric-label">Paiements / Documents</div>
          <strong className="metric-value">
            {order.payments.length} / {documentRows.length}
          </strong>
        </article>
      </section>

      <section className="detail-meta-grid">
        <div>
          <span>Patient code</span>
          <strong>{order.patient.code}</strong>
        </div>
        <div>
          <span>Date commande</span>
          <strong>{formatDate(order.orderDate)}</strong>
        </div>
        <div>
          <span>Date promise</span>
          <strong>{formatDate(order.promisedDate)}</strong>
        </div>
        <div>
          <span>Cree par</span>
          <strong>{order.createdBy.displayName}</strong>
        </div>
      </section>

      <section className="card detail-section-card">
        <h3 className="section-title">Ordonnance associee</h3>
        {snapshotGroups.length ? (
          <>
            {snapshotGroups.length > 1 ? (
              <p className="info-text">Plusieurs ordonnances differentes ont ete capturees sur cette commande.</p>
            ) : null}
            {snapshotGroups.map((group, index) => (
              <div key={index} className="order-rx-card">
                {snapshotGroups.length > 1 ? (
                  <p className="panel-note">
                    Version {index + 1} - Lignes: {group.lines.join(", ")}
                  </p>
                ) : null}
                <p className="panel-note">
                  Examen: {formatExamDate(group.snapshot.examDate)} | OD: {formatEye(group.snapshot.od)} | OS:{" "}
                  {formatEye(group.snapshot.os)}
                </p>
                <p className="panel-note">
                  PD loin/proche: {group.snapshot.pdFar ?? "-"} / {group.snapshot.pdNear ?? "-"} | Prism:{" "}
                  {group.snapshot.prism ?? "-"}
                </p>
                {group.snapshot.notes ? <p className="panel-note">Notes: {group.snapshot.notes}</p> : null}
              </div>
            ))}
          </>
        ) : (
          <p className="detail-empty">Aucune ordonnance enregistree dans cette commande.</p>
        )}
      </section>

      <section className="detail-layout-2">
        <article className="card detail-section-card">
          <h3 className="section-title">Articles</h3>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qte</th>
                <th>PU</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.length ? (
                order.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.descriptionSnapshot}</td>
                    <td>{item.qty}</td>
                    <td>{formatDZD(item.unitPrice)}</td>
                    <td>{formatDZD(item.lineTotal)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    Aucun article.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="card detail-section-card">
          <h3 className="section-title">Paiements client</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th>Montant</th>
                <th>Reference</th>
                {canCancelPayments ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {order.payments.length ? (
                order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateTime(payment.paidAt)}</td>
                    <td>{payment.method}</td>
                    <td>{formatDZD(payment.amount)}</td>
                    <td>{payment.reference || "-"}</td>
                    {canCancelPayments ? (
                      <td>
                        <OrderPaymentCancelButton orderId={order.id} paymentId={payment.id} />
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canCancelPayments ? 5 : 4} className="table-empty-cell">
                    Aucun paiement enregistre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="panel-note">
            Cumul paiements: <strong>{formatDZD(paymentTotal)}</strong> | Valeur commande:{" "}
            <strong>{formatDZD(order.paidAmount)}</strong>
          </p>
          {!paymentConsistent ? (
            <p className="info-text">Attention: ecart detecte entre paiements et montant paye de la commande.</p>
          ) : null}
        </article>
      </section>

      <section className="card detail-section-card">
        <h3 className="section-title">Documents</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Numero</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documentRows.length ? (
              documentRows.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.type}</td>
                  <td>{doc.number}</td>
                  <td>{formatDateTime(doc.date)}</td>
                  <td>
                    <Link href={doc.href} className="table-link" target="_blank">
                      Imprimer
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="table-empty-cell">
                  Aucun document genere pour cette commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {canWriteOrder ? (
        <section className="card detail-section-card">
          <h3 className="section-title">Actions commande</h3>
          <OrderActions
            orderId={order.id}
            currentStatus={order.status}
            balance={order.balance}
            payments={order.payments.map((payment) => ({
              id: payment.id,
              amount: payment.amount,
              method: payment.method
            }))}
          />
        </section>
      ) : null}
    </AppShell>
  );
}
