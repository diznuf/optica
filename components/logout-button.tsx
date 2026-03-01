"use client";

export function LogoutButton({
  className = "btn",
  label = "Se deconnecter"
}: {
  className?: string;
  label?: string;
}) {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button type="button" className={className} onClick={handleLogout}>
      {label}
    </button>
  );
}
