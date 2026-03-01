"use client";

import { FormEvent, useMemo, useState } from "react";
import { setFlashToast, useToast } from "@/components/toast-provider";

type FitLine = {
  id: string;
  eye: "OD" | "OS";
  brand: string;
  power: string;
  baseCurve: string;
  diameter: string;
  notes: string;
};

type PrescriptionFormValue = {
  id?: string;
  examDate?: string;
  odSph?: number | null;
  odCyl?: number | null;
  odAxis?: number | null;
  odAdd?: number | null;
  osSph?: number | null;
  osCyl?: number | null;
  osAxis?: number | null;
  osAdd?: number | null;
  pdFar?: number | null;
  pdNear?: number | null;
  prism?: string | null;
  notes?: string | null;
  contactFits?: Array<{
    eye: "OD" | "OS";
    brand?: string | null;
    power?: number | null;
    baseCurve?: number | null;
    diameter?: number | null;
    notes?: string | null;
  }>;
};

function toInputNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function newFit(eye: "OD" | "OS" = "OD"): FitLine {
  return {
    id: crypto.randomUUID(),
    eye,
    brand: "",
    power: "",
    baseCurve: "",
    diameter: "",
    notes: ""
  };
}

export function PrescriptionForm({
  patientId,
  initial,
  submitMode,
  onCreated,
  showCard = true
}: {
  patientId: string;
  initial?: PrescriptionFormValue;
  submitMode: "create" | "edit";
  onCreated?: (prescriptionId: string) => void;
  showCard?: boolean;
}) {
  const [examDate, setExamDate] = useState(
    initial?.examDate ? new Date(initial.examDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const [odSph, setOdSph] = useState(toInputNumber(initial?.odSph));
  const [odCyl, setOdCyl] = useState(toInputNumber(initial?.odCyl));
  const [odAxis, setOdAxis] = useState(toInputNumber(initial?.odAxis));
  const [odAdd, setOdAdd] = useState(toInputNumber(initial?.odAdd));

  const [osSph, setOsSph] = useState(toInputNumber(initial?.osSph));
  const [osCyl, setOsCyl] = useState(toInputNumber(initial?.osCyl));
  const [osAxis, setOsAxis] = useState(toInputNumber(initial?.osAxis));
  const [osAdd, setOsAdd] = useState(toInputNumber(initial?.osAdd));

  const [pdFar, setPdFar] = useState(toInputNumber(initial?.pdFar));
  const [pdNear, setPdNear] = useState(toInputNumber(initial?.pdNear));

  const [prism, setPrism] = useState(initial?.prism ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [fits, setFits] = useState<FitLine[]>(
    initial?.contactFits?.length
      ? initial.contactFits.map((fit) => ({
          id: crypto.randomUUID(),
          eye: fit.eye,
          brand: fit.brand ?? "",
          power: toInputNumber(fit.power),
          baseCurve: toInputNumber(fit.baseCurve),
          diameter: toInputNumber(fit.diameter),
          notes: fit.notes ?? ""
        }))
      : []
  );

  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const endpoint = useMemo(() => {
    if (submitMode === "create") {
      return "/api/prescriptions";
    }
    return `/api/prescriptions/${initial?.id}`;
  }, [initial?.id, submitMode]);

  function updateFit(id: string, patch: Partial<FitLine>) {
    setFits((prev) => prev.map((fit) => (fit.id === id ? { ...fit, ...patch } : fit)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...(submitMode === "create" ? { patientId } : {}),
      examDate: new Date(`${examDate}T00:00:00.000Z`).toISOString(),
      odSph: parseOptionalNumber(odSph),
      odCyl: parseOptionalNumber(odCyl),
      odAxis: parseOptionalNumber(odAxis),
      odAdd: parseOptionalNumber(odAdd),
      osSph: parseOptionalNumber(osSph),
      osCyl: parseOptionalNumber(osCyl),
      osAxis: parseOptionalNumber(osAxis),
      osAdd: parseOptionalNumber(osAdd),
      pdFar: parseOptionalNumber(pdFar),
      pdNear: parseOptionalNumber(pdNear),
      prism: prism.trim() || undefined,
      notes: notes.trim() || undefined,
      contactFits: fits.map((fit) => ({
        eye: fit.eye,
        brand: fit.brand.trim() || undefined,
        power: parseOptionalNumber(fit.power),
        baseCurve: parseOptionalNumber(fit.baseCurve),
        diameter: parseOptionalNumber(fit.diameter),
        notes: fit.notes.trim() || undefined
      }))
    };

    const res = await fetch(endpoint, {
      method: submitMode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Erreur enregistrement prescription");
      setSaving(false);
      return;
    }

    if (submitMode === "create") {
      toast.success("Prescription enregistree");
      if (onCreated) {
        onCreated((result.data as { id: string }).id);
        setSaving(false);
        return;
      }
      setFlashToast({ type: "success", message: "Prescription enregistree" });
      window.location.reload();
      return;
    }

    toast.success("Prescription mise a jour");
    setSaving(false);
  }

  return (
    <form className={`${showCard ? "card " : ""}prescription-form`} onSubmit={onSubmit}>
      <h3 className="section-title">{submitMode === "create" ? "Nouvelle prescription" : "Modifier prescription"}</h3>

      <label>
        Date examen
        <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
      </label>

      <div className="grid grid-3">
        <label>
          OD SPH
          <input className="input" value={odSph} onChange={(e) => setOdSph(e.target.value)} />
        </label>
        <label>
          OD CYL
          <input className="input" value={odCyl} onChange={(e) => setOdCyl(e.target.value)} />
        </label>
        <label>
          OD AXIS
          <input className="input" value={odAxis} onChange={(e) => setOdAxis(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-3">
        <label>
          OD ADD
          <input className="input" value={odAdd} onChange={(e) => setOdAdd(e.target.value)} />
        </label>
        <label>
          OS SPH
          <input className="input" value={osSph} onChange={(e) => setOsSph(e.target.value)} />
        </label>
        <label>
          OS CYL
          <input className="input" value={osCyl} onChange={(e) => setOsCyl(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-3">
        <label>
          OS AXIS
          <input className="input" value={osAxis} onChange={(e) => setOsAxis(e.target.value)} />
        </label>
        <label>
          OS ADD
          <input className="input" value={osAdd} onChange={(e) => setOsAdd(e.target.value)} />
        </label>
        <label>
          Prism
          <input className="input" value={prism} onChange={(e) => setPrism(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-3">
        <label>
          PD Far
          <input className="input" value={pdFar} onChange={(e) => setPdFar(e.target.value)} />
        </label>
        <label>
          PD Near
          <input className="input" value={pdNear} onChange={(e) => setPdNear(e.target.value)} />
        </label>
      </div>

      <label>
        Notes
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>

      <div className="grid prescription-fit-stack">
        <div className="prescription-fit-head">
          <strong>Contact Lens Fit</strong>
          <button className="btn" type="button" onClick={() => setFits((prev) => [...prev, newFit(prev.length % 2 === 0 ? "OD" : "OS")])}>
            Ajouter fit
          </button>
        </div>

        {fits.map((fit) => (
          <div key={fit.id} className="card prescription-fit-card">
            <div className="grid grid-3">
              <label>
                Oeil
                <select className="input" value={fit.eye} onChange={(e) => updateFit(fit.id, { eye: e.target.value as "OD" | "OS" })}>
                  <option value="OD">OD</option>
                  <option value="OS">OS</option>
                </select>
              </label>
              <label>
                Brand
                <input className="input" value={fit.brand} onChange={(e) => updateFit(fit.id, { brand: e.target.value })} />
              </label>
              <label>
                Power
                <input className="input" value={fit.power} onChange={(e) => updateFit(fit.id, { power: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-3">
              <label>
                Base Curve
                <input className="input" value={fit.baseCurve} onChange={(e) => updateFit(fit.id, { baseCurve: e.target.value })} />
              </label>
              <label>
                Diameter
                <input className="input" value={fit.diameter} onChange={(e) => updateFit(fit.id, { diameter: e.target.value })} />
              </label>
              <label>
                Notes
                <input className="input" value={fit.notes} onChange={(e) => updateFit(fit.id, { notes: e.target.value })} />
              </label>
            </div>
            <button className="btn" type="button" onClick={() => setFits((prev) => prev.filter((f) => f.id !== fit.id))}>
              Supprimer fit
            </button>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Enregistrement..." : submitMode === "create" ? "Creer prescription" : "Mettre a jour"}
      </button>
    </form>
  );
}
