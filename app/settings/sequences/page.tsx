import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SequencesAdminPanel } from "@/components/sequences-admin-panel";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 20;

function readParam(input: string | string[] | undefined) {
  if (!input) {
    return "";
  }
  return Array.isArray(input) ? input[0] ?? "" : input;
}

function parsePage(input: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export default async function SequencesSettingsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (session.role !== "ADMIN") {
    return (
      <AppShell session={session} title="Sequences documents">
        <p>Acces reserve a l'administrateur.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const allSequences = await db.sequence.findMany({ orderBy: { type: "asc" } });
  const filteredSequences = q
    ? allSequences.filter((sequence) => sequence.type.toLowerCase().includes(q.toLowerCase()))
    : allSequences;
  const totalCount = filteredSequences.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const sequences = filteredSequences.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const serializedSequences = sequences.map((sequence) => ({
    id: sequence.id,
    type: sequence.type,
    currentValue: sequence.currentValue,
    updatedAt: sequence.updatedAt.toISOString()
  }));

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/settings/sequences?${query}` : "/settings/sequences";
  }

  return (
    <AppShell session={session} title="Sequences documents">
      <form className="page-filter-form" method="GET">
        <label>
          Recherche type
          <input className="input" name="q" defaultValue={q} placeholder="ORDER, INVOICE..." />
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/settings/sequences" className="btn">
          Reinitialiser
        </Link>
      </form>

      <div className="table-toolbar">
        <div className="table-meta">
          Total: {totalCount} - Page {currentPage}/{totalPages}
        </div>
        <div className="pagination-controls">
          {currentPage > 1 ? (
            <Link href={buildHref(currentPage - 1)} className="btn">
              Precedent
            </Link>
          ) : (
            <span className="btn btn-disabled">Precedent</span>
          )}
          {currentPage < totalPages ? (
            <Link href={buildHref(currentPage + 1)} className="btn">
              Suivant
            </Link>
          ) : (
            <span className="btn btn-disabled">Suivant</span>
          )}
        </div>
      </div>

      <p className="panel-note">Vous pouvez ajuster un compteur si besoin (correction de numerotation, import historique, reprise).</p>

      <SequencesAdminPanel sequences={serializedSequences} />
    </AppShell>
  );
}
