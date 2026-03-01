import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import { requirePageSession } from "@/lib/page-auth";

export default async function DashboardPage() {
  const session = await requirePageSession();
  const canViewSupplierDebt = ["ADMIN", "GESTIONNAIRE_STOCK"].includes(session.role);

  const [patients, orders, readyOrders, unpaidInvoices, todayCash, products, recentOrders, recentPatients] = await Promise.all([
    db.patient.count(),
    db.order.count({ where: { status: { in: ["CONFIRMEE", "EN_ATELIER", "PRETE"] } } }),
    db.order.count({ where: { status: "PRETE" } }),
    db.supplierInvoice.aggregate({ where: { balance: { gt: 0 } }, _sum: { balance: true } }),
    db.customerPayment.aggregate({ _sum: { amount: true } }),
    db.product.findMany({ include: { stockLots: { select: { qtyRemaining: true } } } }),
    db.order.findMany({
      orderBy: { orderDate: "desc" },
      take: 6,
      include: { patient: { select: { firstName: true, lastName: true } } }
    }),
    db.patient.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, code: true, firstName: true, lastName: true, createdAt: true }
    })
  ]);

  const lowStockCount = products.filter((p) => p.stockLots.reduce((s, l) => s + l.qtyRemaining, 0) <= p.reorderLevel).length;

  return (
    <AppShell session={session} title="Dashboard">
      <div className="dashboard-layout">
        <section className="card dashboard-hero">
          <div>
            <p className="dashboard-hero-kicker">Pilotage quotidien</p>
            <h2>Vue rapide des operations atelier et vente</h2>
            <p className="dashboard-hero-note">
              Suivez commandes, stock critique, caisse et dettes fournisseurs sans quitter cette page.
            </p>
          </div>
          <div className="dashboard-hero-actions">
            <Link href="/orders/new" className="btn btn-primary">
              Nouvelle commande
            </Link>
            <Link href="/patients" className="btn">
              Ouvrir patients
            </Link>
            {canViewSupplierDebt ? (
              <Link href="/reports/supplier-aging" className="btn">
                Voir Echeances Fournisseurs
              </Link>
            ) : (
              <Link href="/reports/daily-cash" className="btn">
                Voir caisse du jour
              </Link>
            )}
          </div>
        </section>

        <div className="grid grid-3 metrics-grid dashboard-kpi-grid">
          <article className="card metric-card">
            <div className="metric-label">Patients</div>
            <strong className="metric-value">{patients}</strong>
          </article>
          <article className="card metric-card">
            <div className="metric-label">Commandes en cours</div>
            <strong className="metric-value">{orders}</strong>
          </article>
          <article className="card metric-card">
            <div className="metric-label">Commandes pretes</div>
            <strong className="metric-value">{readyOrders}</strong>
          </article>
          <article className="card metric-card">
            <div className="metric-label">Dette fournisseurs</div>
            <strong className="metric-value">{canViewSupplierDebt ? formatDZD(unpaidInvoices._sum.balance ?? 0) : "Masque"}</strong>
          </article>
          <article className="card metric-card">
            <div className="metric-label">Caisse (global)</div>
            <strong className="metric-value">{formatDZD(todayCash._sum.amount ?? 0)}</strong>
          </article>
          <article className="card metric-card">
            <div className="metric-label">Alertes stock bas</div>
            <strong className="metric-value">{lowStockCount}</strong>
          </article>
        </div>

        <section className="dashboard-columns">
          <article className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <h3>Commandes recentes</h3>
              <Link href="/orders" className="table-link">
                Ouvrir
              </Link>
            </div>
            <div className="dashboard-panel-body">
              <table className="table">
                <thead>
                  <tr>
                    <th>Numero</th>
                    <th>Patient</th>
                    <th>Statut</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length ? (
                    recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.number}</td>
                        <td>{order.patient.firstName + " " + order.patient.lastName}</td>
                        <td>{order.status}</td>
                        <td>{formatDZD(order.totalAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="table-empty-cell">
                        Aucune commande recente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <h3>Nouveaux patients</h3>
              <Link href="/patients" className="table-link">
                Ouvrir
              </Link>
            </div>
            <div className="dashboard-panel-body">
              <ul className="dashboard-patient-list">
                {recentPatients.length ? (
                  recentPatients.map((patient) => (
                    <li key={patient.id}>
                      <strong>{patient.code}</strong> - {patient.firstName} {patient.lastName}
                      <span>{patient.createdAt.toISOString().slice(0, 10)}</span>
                    </li>
                  ))
                ) : (
                  <li>Aucun patient recent.</li>
                )}
              </ul>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
