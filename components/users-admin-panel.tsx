"use client";

import { FormEvent, useState } from "react";
import { UserRole } from "@prisma/client";
import { Modal } from "@/components/modal";
import { setFlashToast, useToast } from "@/components/toast-provider";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};

type UserDraft = {
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

const roleOptions: Array<UserRole> = ["ADMIN", "OPTICIEN", "GESTIONNAIRE_STOCK", "VENDEUR"];

const emptyDraft: UserDraft = {
  username: "",
  displayName: "",
  role: "VENDEUR",
  isActive: true,
  password: ""
};

export function UsersAdminPanel({
  users,
  currentUserId
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<UserDraft>(emptyDraft);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraft>(emptyDraft);
  const toast = useToast();

  function openEdit(user: UserRow) {
    setEditUser(user);
    setEditDraft({
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      password: ""
    });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!createDraft.username.trim() || !createDraft.displayName.trim() || createDraft.password.length < 6) {
      toast.error("Login, nom et mot de passe (6+) sont obligatoires.");
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: createDraft.username.trim(),
        displayName: createDraft.displayName.trim(),
        role: createDraft.role,
        isActive: createDraft.isActive,
        password: createDraft.password
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error ?? "Creation utilisateur impossible");
      return;
    }

    setFlashToast({ type: "success", message: "Utilisateur cree" });
    window.location.reload();
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editUser) {
      return;
    }
    if (!editDraft.username.trim() || !editDraft.displayName.trim()) {
      toast.error("Login et nom sont obligatoires.");
      return;
    }
    if (editDraft.password && editDraft.password.length < 6) {
      toast.error("Mot de passe minimum 6 caracteres.");
      return;
    }

    const body: Record<string, unknown> = {
      username: editDraft.username.trim(),
      displayName: editDraft.displayName.trim(),
      role: editDraft.role,
      isActive: editDraft.isActive
    };
    if (editDraft.password) {
      body.password = editDraft.password;
    }

    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error ?? "Mise a jour utilisateur impossible");
      return;
    }

    setFlashToast({ type: "success", message: "Utilisateur mis a jour" });
    window.location.reload();
  }

  return (
    <>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          Nouvel utilisateur
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Nom</th>
            <th>Role</th>
            <th>Actif</th>
            <th>Cree le</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.length ? (
            users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.displayName}</td>
                <td>{user.role}</td>
                <td>{user.isActive ? "Oui" : "Non"}</td>
                <td>{user.createdAt.slice(0, 10)}</td>
                <td>
                  <button className="btn" type="button" onClick={() => openEdit(user)}>
                    Modifier
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="table-empty-cell">
                Aucun utilisateur sur ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Modal
        open={createOpen}
        title="Creation utilisateur"
        onClose={() => {
          setCreateOpen(false);
          setCreateDraft(emptyDraft);
        }}
      >
        <form className="grid user-form-grid" onSubmit={handleCreate}>
          <div className="grid grid-3">
            <label>
              Login
              <input
                className="input"
                value={createDraft.username}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </label>
            <label>
              Nom affichage
              <input
                className="input"
                value={createDraft.displayName}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                required
              />
            </label>
            <label>
              Role
              <select
                className="input"
                value={createDraft.role}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-3">
            <label>
              Mot de passe
              <input
                className="input"
                type="password"
                minLength={6}
                value={createDraft.password}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </label>
            <label className="user-checkbox">
              <input
                type="checkbox"
                checked={createDraft.isActive}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Actif
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Creer
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editUser)}
        title={editUser ? `Edition ${editUser.username}` : "Edition utilisateur"}
        onClose={() => {
          setEditUser(null);
          setEditDraft(emptyDraft);
        }}
      >
        <form className="grid user-form-grid" onSubmit={handleEdit}>
          <div className="grid grid-3">
            <label>
              Login
              <input
                className="input"
                value={editDraft.username}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </label>
            <label>
              Nom affichage
              <input
                className="input"
                value={editDraft.displayName}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                required
              />
            </label>
            <label>
              Role
              <select
                className="input"
                value={editDraft.role}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-3">
            <label>
              Nouveau mot de passe (optionnel)
              <input
                className="input"
                type="password"
                minLength={6}
                value={editDraft.password}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
            <label className="user-checkbox">
              <input
                type="checkbox"
                checked={editDraft.isActive}
                disabled={editUser?.id === currentUserId}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Actif
            </label>
          </div>
          {editUser?.id === currentUserId ? <p className="panel-note">Votre propre compte admin ne peut pas etre desactive ici.</p> : null}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
