"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PatientModalForm, type PatientFormRecord } from "@/components/patient-modal-form";
import { PrescriptionCreateModal } from "@/components/prescription-create-modal";
import { setFlashToast, useToast } from "@/components/toast-provider";

type Patient = PatientFormRecord;
type Product = { id: string; name: string; sellPrice: number };
type Prescription = {
  id: string;
  examDate: string;
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
};
type OrderLine = {
  id: string;
  productId: string;
  qty: number;
  unitPrice: number;
};

function newLine(): OrderLine {
  return {
    id: crypto.randomUUID(),
    productId: "",
    qty: 1,
    unitPrice: 0
  };
}

function formatBirthDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  return value.slice(0, 10);
}

export function NewOrderWorkspace() {
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get("patientId");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patientId, setPatientId] = useState("");
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([newLine()]);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [prescriptionPatient, setPrescriptionPatient] = useState<PatientFormRecord | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setLoadingCatalog(true);
    Promise.all([fetch("/api/patients"), fetch("/api/products")])
      .then(async ([p, pr]) => {
        const pData = await p.json();
        const prData = await pr.json();
        if (!active) {
          return;
        }
        const patientList = (pData.data as Patient[]) ?? [];
        const productList = (prData.data as Product[]) ?? [];
        setPatients(patientList);
        setProducts(productList);
        if (preselectedPatientId && patientList.some((item) => item.id === preselectedPatientId)) {
          setPatientId(preselectedPatientId);
        }
      })
      .catch(() => {
        toast.error("Chargement initial impossible");
      })
      .finally(() => {
        if (active) {
          setLoadingCatalog(false);
        }
      });

    return () => {
      active = false;
    };
  }, [preselectedPatientId, toast]);

  useEffect(() => {
    if (!patientId) {
      setPrescriptions([]);
      setSelectedPrescriptionId("");
      return;
    }

    loadPrescriptions(patientId);
  }, [patientId]);

  function updateLine(lineId: string, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(lineId: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.id !== lineId)));
  }

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0), [lines]);

  const selectedPrescription = useMemo(
    () => prescriptions.find((prescription) => prescription.id === selectedPrescriptionId),
    [prescriptions, selectedPrescriptionId]
  );
  const selectedPatient = useMemo(() => patients.find((patient) => patient.id === patientId), [patients, patientId]);
  const lineDetails = useMemo(
    () =>
      lines.map((line, index) => {
        const product = products.find((item) => item.id === line.productId);
        return {
          lineId: line.id,
          index,
          productName: product?.name ?? "Produit non selectionne",
          qty: line.qty,
          unitPrice: line.unitPrice,
          total: line.qty * line.unitPrice,
          valid: Boolean(product)
        };
      }),
    [lines, products]
  );
  const totalQty = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);
  const hasInvalidLines = lineDetails.some((line) => !line.valid);

  function loadPrescriptions(nextPatientId: string, preferredPrescriptionId?: string) {
    fetch(`/api/prescriptions?patientId=${nextPatientId}`)
      .then(async (res) => {
        const payload = await res.json();
        const list = (payload.data as Prescription[]) ?? [];
        setPrescriptions(list);
        if (preferredPrescriptionId && list.some((item) => item.id === preferredPrescriptionId)) {
          setSelectedPrescriptionId(preferredPrescriptionId);
          return;
        }
        setSelectedPrescriptionId(list[0]?.id ?? "");
      })
      .catch(() => {
        setPrescriptions([]);
        setSelectedPrescriptionId("");
      });
  }

  function onPatientCreated(patient: PatientFormRecord) {
    setPatients((prev) => [patient, ...prev.filter((item) => item.id !== patient.id)]);
    setPatientId(patient.id);
    setPatientModalOpen(false);
    setPrescriptionPatient(patient);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const prescriptionSnapshot = selectedPrescription
      ? {
          id: selectedPrescription.id,
          examDate: selectedPrescription.examDate,
          od: {
            sph: selectedPrescription.odSph,
            cyl: selectedPrescription.odCyl,
            axis: selectedPrescription.odAxis,
            add: selectedPrescription.odAdd
          },
          os: {
            sph: selectedPrescription.osSph,
            cyl: selectedPrescription.osCyl,
            axis: selectedPrescription.osAxis,
            add: selectedPrescription.osAdd
          },
          pdFar: selectedPrescription.pdFar,
          pdNear: selectedPrescription.pdNear,
          prism: selectedPrescription.prism,
          notes: selectedPrescription.notes
        }
      : undefined;

    const payloadLines = lines.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product) {
        return null;
      }
      return {
        productId: line.productId,
        descriptionSnapshot: product.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
        prescriptionSnapshotJson: prescriptionSnapshot
      };
    });

    if (!patientId) {
      toast.error("Selection patient requise");
      return;
    }

    if (payloadLines.some((line) => !line)) {
      toast.error("Chaque ligne doit avoir un produit valide");
      return;
    }

    const now = new Date().toISOString();
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        orderDate: now,
        items: payloadLines
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur creation commande");
      return;
    }

    setFlashToast({ type: "success", message: "Commande creee" });
    window.location.href = `/orders/${payload.data.id}`;
  }

  return (
    <div className="order-workspace">
      <form id="order-create-form" className="card order-builder" onSubmit={handleSubmit}>
        <header className="order-builder-header">
          <h1 className="page-title">Nouvelle commande</h1>
          <p className="order-builder-subtitle">Etape 1: patient - Etape 2: ordonnance - Etape 3: articles</p>
          <div className="order-step-pills">
            <span className={`order-step-pill ${selectedPatient ? "done" : ""}`}>Patient</span>
            <span className={`order-step-pill ${selectedPrescription ? "done" : ""}`}>Ordonnance</span>
            <span className={`order-step-pill ${!hasInvalidLines ? "done" : ""}`}>Articles</span>
          </div>
        </header>

        <section className="card order-step">
          <div className="order-step-head">
            <h2>1. Patient</h2>
          </div>
          <div className="order-patient-row">
            <label>
              Patient
              <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
                <option value="">Selectionner</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.code} - {patient.firstName} {patient.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="order-inline-actions">
              <button className="btn" type="button" onClick={() => setPatientModalOpen(true)}>
                Nouveau patient
              </button>
              <button
                className="btn"
                type="button"
                disabled={!selectedPatient}
                onClick={() => setPrescriptionPatient(selectedPatient ?? null)}
              >
                Nouvelle ordonnance
              </button>
            </div>
          </div>
          {selectedPatient ? (
            <div className="order-patient-meta">
              <span>Code: {selectedPatient.code}</span>
              <span>Tel: {selectedPatient.phone || "-"}</span>
              <span>Naissance: {formatBirthDate(selectedPatient.birthDate)}</span>
            </div>
          ) : null}
          {loadingCatalog ? <p className="panel-note">Chargement catalogue...</p> : null}
        </section>

        <section className="card order-step">
          <div className="order-step-head">
            <h2>2. Ordonnance</h2>
          </div>
          <label>
            Prescription associee
            <select
              className="input"
              value={selectedPrescriptionId}
              onChange={(e) => setSelectedPrescriptionId(e.target.value)}
              disabled={!prescriptions.length}
            >
              <option value="">Aucune</option>
              {prescriptions.map((prescription) => (
                <option key={prescription.id} value={prescription.id}>
                  {new Date(prescription.examDate).toISOString().slice(0, 10)} - OD({prescription.odSph ?? "-"}/
                  {prescription.odCyl ?? "-"}/{prescription.odAxis ?? "-"})
                </option>
              ))}
            </select>
          </label>

          {selectedPrescription ? (
            <div className="order-rx-card">
              OD({selectedPrescription.odSph ?? "-"}/{selectedPrescription.odCyl ?? "-"}/{selectedPrescription.odAxis ?? "-"}) - OS(
              {selectedPrescription.osSph ?? "-"}/{selectedPrescription.osCyl ?? "-"}/{selectedPrescription.osAxis ?? "-"}) - PD(
              {selectedPrescription.pdFar ?? "-"}/{selectedPrescription.pdNear ?? "-"})
            </div>
          ) : (
            <div className="order-rx-card muted">
              {selectedPatient ? "Aucune ordonnance selectionnee." : "Selectionnez d'abord un patient."}
            </div>
          )}
        </section>

        <section className="card order-step">
          <div className="order-step-head">
            <h2>3. Articles commande</h2>
            <button className="btn" type="button" onClick={addLine}>
              Ajouter ligne
            </button>
          </div>

          <div className="grid order-lines-grid">
            {lines.map((line, index) => (
              <div key={line.id} className="card order-line-card">
                <div className="order-line-head">
                  <strong>Ligne {index + 1}</strong>
                  <span>{(line.qty * line.unitPrice).toFixed(2)} DZD</span>
                </div>
                <div className="grid grid-3">
                  <label>
                    Produit
                    <select
                      className="input"
                      value={line.productId}
                      onChange={(e) => {
                        const product = products.find((item) => item.id === e.target.value);
                        updateLine(line.id, {
                          productId: e.target.value,
                          unitPrice: product ? product.sellPrice : 0
                        });
                      }}
                      required
                    >
                      <option value="">Selectionner</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Quantite
                    <input
                      className="input"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={line.qty}
                      onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })}
                      required
                    />
                  </label>

                  <label>
                    Prix unitaire (DZD)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.id, { unitPrice: Number(e.target.value) })}
                      required
                    />
                  </label>
                </div>
                <div className="order-line-footer">
                  <span>Total ligne: {(line.qty * line.unitPrice).toFixed(2)} DZD</span>
                  <button className="btn" type="button" onClick={() => removeLine(line.id)}>
                    Supprimer ligne
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </form>

      <aside className="card order-summary-panel">
        <h2>Resume commande</h2>
        <div className="order-summary-grid">
          <div>
            <span>Patient</span>
            <strong>
              {selectedPatient ? `${selectedPatient.code} - ${selectedPatient.firstName} ${selectedPatient.lastName}` : "Non selectionne"}
            </strong>
          </div>
          <div>
            <span>Ordonnance</span>
            <strong>{selectedPrescription ? new Date(selectedPrescription.examDate).toISOString().slice(0, 10) : "Aucune"}</strong>
          </div>
          <div>
            <span>Lignes</span>
            <strong>{lines.length}</strong>
          </div>
          <div>
            <span>Quantite totale</span>
            <strong>{totalQty.toFixed(2)}</strong>
          </div>
        </div>

        <div className="order-summary-lines">
          {lineDetails.map((line) => (
            <div key={line.lineId} className={`order-summary-line${line.valid ? "" : " invalid"}`}>
              <span>
                #{line.index + 1} {line.productName}
              </span>
              <strong>
                {line.qty.toFixed(2)} x {line.unitPrice.toFixed(2)}
              </strong>
            </div>
          ))}
        </div>

        <div className="order-summary-total">
          <span>Total commande</span>
          <strong>{total.toFixed(2)} DZD</strong>
        </div>

        {hasInvalidLines ? <div className="error-text">Des lignes n'ont pas de produit valide.</div> : null}
        {!products.length && !loadingCatalog ? <div className="error-text">Aucun produit disponible pour la commande.</div> : null}

        <button className="btn btn-primary order-submit-btn" type="submit" form="order-create-form" disabled={loadingCatalog}>
          Creer commande
        </button>
      </aside>

      <PatientModalForm open={patientModalOpen} mode="create" onClose={() => setPatientModalOpen(false)} onSaved={onPatientCreated} />
      <PrescriptionCreateModal
        open={Boolean(prescriptionPatient)}
        patient={prescriptionPatient}
        onClose={() => setPrescriptionPatient(null)}
        onCreated={(prescriptionId) => {
          if (prescriptionPatient) {
            loadPrescriptions(prescriptionPatient.id, prescriptionId);
          }
          setPrescriptionPatient(null);
        }}
      />
    </div>
  );
}
