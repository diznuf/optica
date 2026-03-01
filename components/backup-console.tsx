"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast-provider";

type BackupRecord = {
  id: string;
  filePath: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupConsole() {
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    const res = await fetch("/api/admin/backups");
    const payload = await res.json();
    const list = (payload.data as BackupRecord[]) ?? [];
    setRecords(list);
    if (!selectedBackupId) {
      const firstSuccess = list.find((record) => record.status === "SUCCESS");
      if (firstSuccess) {
        setSelectedBackupId(firstSuccess.id);
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedBackup = useMemo(
    () => records.find((record) => record.id === selectedBackupId) ?? null,
    [records, selectedBackupId]
  );

  async function runBackup() {
    setValidationResult(null);

    const res = await fetch("/api/admin/backup", { method: "POST" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur backup");
      return;
    }
    toast.success("Backup cree et verifie.");
    await load();
  }

  async function validateSelectedBackup() {
    setValidationResult(null);

    if (!selectedBackupId) {
      toast.error("Selectionnez un backup.");
      return;
    }

    const res = await fetch("/api/admin/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId: selectedBackupId, dryRun: true })
    });
    const payload = await res.json();
    if (!res.ok) {
      setValidationResult(payload.error ?? "Validation restore echouee");
      return;
    }

    const details = payload.data?.validation;
    setValidationResult(
      `Validation OK. Taille: ${formatBytes(details?.sizeBytes ?? 0)}. SHA256: ${String(details?.checksumSha256 ?? "").slice(0, 16)}...`
    );
  }

  async function runRestore() {
    setValidationResult(null);

    if (!selectedBackupId) {
      toast.error("Selectionnez un backup.");
      return;
    }
    if (confirmation !== "RESTORE") {
      toast.error("Tapez RESTORE pour confirmer.");
      return;
    }

    const confirmed = window.confirm("Cette action remplace la base active. Continuer ?");
    if (!confirmed) {
      return;
    }

    const res = await fetch("/api/admin/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backupId: selectedBackupId,
        confirmation: "RESTORE"
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "Erreur restore");
      return;
    }

    toast.info("Restauration terminee. Redemarrez le serveur pour reprendre en environnement propre.");
    setConfirmation("");
    await load();
  }

  return (
    <div className="grid action-stack">
      <div className="form-actions">
        <button className="btn btn-primary" type="button" onClick={runBackup}>
          Lancer backup
        </button>
        <button className="btn" type="button" onClick={validateSelectedBackup} disabled={!selectedBackupId}>
          Verifier backup
        </button>
      </div>

      <div className="card action-card action-form">
        <h3 className="section-title">Restauration</h3>
        <label>
          Backup selectionne
          <select className="input" value={selectedBackupId} onChange={(e) => setSelectedBackupId(e.target.value)}>
            <option value="">Selectionner un backup</option>
            {records
              .filter((record) => record.status === "SUCCESS")
              .map((record) => (
                <option key={record.id} value={record.id}>
                  {new Date(record.createdAt).toISOString().slice(0, 16).replace("T", " ")} - {formatBytes(record.sizeBytes)}
                </option>
              ))}
          </select>
        </label>
        {selectedBackup ? (
          <div>
            Fichier: <code>{selectedBackup.filePath}</code>
          </div>
        ) : null}
        <label>
          Confirmation (tapez RESTORE)
          <input className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="RESTORE" />
        </label>
        <button className="btn" type="button" onClick={runRestore} disabled={!selectedBackupId}>
          Restaurer backup
        </button>
      </div>

      {validationResult ? <div className="info-text">{validationResult}</div> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Statut</th>
            <th>Fichier</th>
            <th>Taille</th>
            <th>SHA256</th>
            <th>Erreur</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{new Date(record.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
              <td>{record.status}</td>
              <td>{record.filePath || "-"}</td>
              <td>{formatBytes(record.sizeBytes)}</td>
              <td>{record.checksumSha256 ? `${record.checksumSha256.slice(0, 12)}...` : "-"}</td>
              <td>{record.error ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
