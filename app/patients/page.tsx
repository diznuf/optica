import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PatientsWorkspace } from "@/components/patients-workspace";
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

export default async function PatientsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));

  const where: Prisma.PatientWhereInput | undefined = q
    ? {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { code: { contains: q } },
          { phone: { contains: q } }
        ]
      }
    : undefined;

  const totalCount = await db.patient.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const patients = await db.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      birthDate: true,
      address: true,
      notes: true,
      createdAt: true
    }
  });

  const serializedPatients = patients.map((patient) => ({
    ...patient,
    birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
    createdAt: patient.createdAt.toISOString()
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
    return query ? `/patients?${query}` : "/patients";
  }

  return (
    <AppShell session={session} title="Patients">
      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Code, nom, telephone" />
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/patients" className="btn">
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

      <PatientsWorkspace initialPatients={serializedPatients} hideSearch />
    </AppShell>
  );
}
