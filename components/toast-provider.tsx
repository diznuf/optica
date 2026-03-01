"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type ToastType = "success" | "error" | "info";

type ToastPayload = {
  type: ToastType;
  message: string;
  durationMs?: number;
};

type ToastItem = ToastPayload & {
  id: string;
};

type ToastApi = {
  show: (payload: ToastPayload) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const FLASH_TOAST_KEY = "optica_flash_toast_v1";

const ToastContext = createContext<ToastApi | null>(null);

function readFlashToast(): ToastPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(FLASH_TOAST_KEY);
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(FLASH_TOAST_KEY);
  try {
    const parsed = JSON.parse(raw) as ToastPayload;
    if (!parsed?.type || !parsed?.message) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setFlashToast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(FLASH_TOAST_KEY, JSON.stringify(payload));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const show = useCallback(
    (payload: ToastPayload) => {
      const id = crypto.randomUUID();
      const item: ToastItem = {
        id,
        type: payload.type,
        message: payload.message,
        durationMs: payload.durationMs ?? 3500
      };

      setToasts((prev) => [...prev, item]);
      timersRef.current[id] = window.setTimeout(() => removeToast(id), item.durationMs);
    },
    [removeToast]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show({ type: "success", message }),
      error: (message) => show({ type: "error", message }),
      info: (message) => show({ type: "info", message })
    }),
    [show]
  );

  useEffect(() => {
    const flashToast = readFlashToast();
    if (flashToast) {
      show(flashToast);
    }
  }, [show]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast-item ${toast.type}`}>
            <p>{toast.message}</p>
            <button type="button" className="btn toast-close-btn" onClick={() => removeToast(toast.id)}>
              Fermer
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
