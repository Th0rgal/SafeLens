"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Info, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastSeverity = "success" | "info" | "warning" | "severe";

interface Toast {
  id: string;
  severity: ToastSeverity;
  title: string;
  description?: string;
  duration?: number; // ms, 0 = manual dismiss only
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  severe: (title: string, description?: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Styling maps                                                       */
/* ------------------------------------------------------------------ */

const severityConfig: Record<
  ToastSeverity,
  { icon: typeof CheckCircle2; bar: string; border: string; bg: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    bar: "bg-emerald-500",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
  },
  info: {
    icon: Info,
    bar: "bg-accent",
    border: "border-accent/30",
    bg: "bg-accent/15",
    iconColor: "text-accent",
  },
  warning: {
    icon: AlertTriangle,
    bar: "bg-amber-500",
    border: "border-amber-500/30",
    bg: "bg-amber-500/15",
    iconColor: "text-amber-400",
  },
  severe: {
    icon: AlertOctagon,
    bar: "bg-red-500",
    border: "border-red-500/30",
    bg: "bg-red-500/15",
    iconColor: "text-red-400",
  },
};

const DEFAULT_DURATION: Record<ToastSeverity, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  severe: 8000,
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Single toast item                                                  */
/* ------------------------------------------------------------------ */

function ToastItem({
  toast,
  onDismiss,
  onExpand,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  onExpand: (toast: Toast) => void;
}) {
  const cfg = severityConfig[toast.severity];
  const Icon = cfg.icon;
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const dur = toast.duration ?? DEFAULT_DURATION[toast.severity];
    if (dur > 0) {
      timerRef.current = setTimeout(dismiss, dur);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast, dismiss]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto relative flex w-80 cursor-pointer items-start gap-3 overflow-hidden rounded-md border px-4 py-3 bg-surface/95 backdrop-blur-md shadow-lg transition-all duration-200",
        cfg.border,
        cfg.bg,
        exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
      )}
      onClick={() => onExpand(toast)}
      onMouseEnter={() => clearTimeout(timerRef.current)}
      onMouseLeave={() => {
        const dur = toast.duration ?? DEFAULT_DURATION[toast.severity];
        if (dur > 0) timerRef.current = setTimeout(dismiss, dur);
      }}
    >
      {/* Left accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-1", cfg.bar)} />

      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.iconColor)} />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{toast.description}</p>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="shrink-0 rounded p-0.5 text-muted hover:text-fg transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded modal                                                     */
/* ------------------------------------------------------------------ */

function ToastModal({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const cfg = severityConfig[toast.severity];
  const Icon = cfg.icon;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative mx-4 w-full max-w-md overflow-hidden rounded-md border glass-panel",
          cfg.border
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent bar */}
        <div className={cn("h-1 w-full", cfg.bar)} />

        <div className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <Icon className={cn("h-5 w-5", cfg.iconColor)} />
            <h3 className="text-base font-semibold text-fg">{toast.title}</h3>
          </div>

          {toast.description && (
            <p className="text-sm leading-relaxed text-muted">{toast.description}</p>
          )}

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-md bg-accent/10 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expanded, setExpanded] = useState<Toast | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (title, description) => addToast({ severity: "success", title, description }),
    info: (title, description) => addToast({ severity: "info", title, description }),
    warning: (title, description) => addToast({ severity: "warning", title, description }),
    severe: (title, description) => addToast({ severity: "severe", title, description }),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {mounted &&
        createPortal(
          <>
            {/* Toast stack - bottom-right */}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col-reverse gap-2">
              {toasts.map((t) => (
                <ToastItem
                  key={t.id}
                  toast={t}
                  onDismiss={dismiss}
                  onExpand={(toast) => {
                    setExpanded(toast);
                    dismiss(toast.id);
                  }}
                />
              ))}
            </div>

            {/* Expanded modal */}
            {expanded && (
              <ToastModal toast={expanded} onClose={() => setExpanded(null)} />
            )}
          </>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
