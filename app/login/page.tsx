"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Erreur de connexion");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="container login-page">
      <section className="login-surface">
        <aside className="card login-brand-panel">
          <p className="login-kicker">Optica v1</p>
          <h1 className="page-title">I See</h1>
          <p className="login-subtitle">
          </p>
          <div className="login-brand-tags">
            <span>Patients</span>
            <span>Fornisseur</span>
            <span>Stock</span>
          </div>
        
        </aside>

        <form className="card login-card" onSubmit={onSubmit}>
          <h2 className="login-form-title">Connexion</h2>
          <label>
            Utilisateur
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Mot de passe
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="error-text">{error}</div> : null}
          <button className="btn btn-primary login-submit-btn" type="submit" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
