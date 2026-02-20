/**
 * Blur diagnostics — tracks when backdrop-filter visually drops and correlates
 * with window/compositor events. Enable via VITE_DEBUG_BLUR=1 or by calling
 * window.__enableBlurDebug() from the dev console.
 *
 * Logs are prefixed [blur-diag] for easy filtering.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface CSSStyleDeclaration {
    webkitBackdropFilter?: string;
  }
  interface Window {
    __TAURI__?: unknown;
    __blurDiag?: unknown;
  }
}

const TAG = "[blur-diag]";

interface BlurEvent {
  time: number;
  type: string;
  detail?: string;
}

const eventLog: BlurEvent[] = [];

function log(type: string, detail?: string) {
  const entry: BlurEvent = { time: performance.now(), type, detail };
  eventLog.push(entry);
  if (eventLog.length > 200) eventLog.shift();
  console.log(TAG, type, detail ?? "");
}

/**
 * Attach to the sidebar <aside> element. Call the returned cleanup function
 * to remove all listeners.
 */
export function attachBlurDiagnostics(sidebarEl: HTMLElement): () => void {
  const ac = new AbortController();
  const { signal } = ac;

  log("init", `element: <${sidebarEl.tagName.toLowerCase()}> .${[...sidebarEl.classList].join(".")}`);

  // ── 1. Poll computed backdrop-filter value ──────────────────────────
  let lastBf = "";
  let lastWkBf = "";
  let pollCount = 0;

  const pollId = setInterval(() => {
    const cs = getComputedStyle(sidebarEl);
    const bf = cs.backdropFilter ?? "";
    const wkBf = cs.webkitBackdropFilter ?? "";

    if (bf !== lastBf || wkBf !== lastWkBf) {
      log("computed-change", `backdropFilter: "${lastBf}" → "${bf}" | -webkit-: "${lastWkBf}" → "${wkBf}"`);
      lastBf = bf;
      lastWkBf = wkBf;
    }

    // Every 5s, confirm it's still alive (first 30s only)
    pollCount++;
    if (pollCount % 50 === 0 && pollCount <= 300) {
      log("poll-heartbeat", `bf="${bf}" wk="${wkBf}" rect=${JSON.stringify(sidebarEl.getBoundingClientRect())}`);
    }
  }, 100);

  // ── 2. Window focus / blur ──────────────────────────────────────────
  window.addEventListener("focus", () => log("window-focus"), { signal });
  window.addEventListener("blur", () => log("window-blur"), { signal });

  // ── 3. Visibility change (tab/app switch) ───────────────────────────
  document.addEventListener(
    "visibilitychange",
    () => log("visibility", document.visibilityState),
    { signal },
  );

  // ── 4. Resize ───────────────────────────────────────────────────────
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    "resize",
    () => {
      if (!resizeTimer) log("resize-start", `${window.innerWidth}x${window.innerHeight}`);
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        log("resize-end", `${window.innerWidth}x${window.innerHeight}`);
        resizeTimer = null;
      }, 200);
    },
    { signal },
  );

  // ── 5. Scroll on main content (sibling) ─────────────────────────────
  const main = document.querySelector("main");
  if (main) {
    main.addEventListener(
      "scroll",
      (() => {
        let scrollTimer: ReturnType<typeof setTimeout> | null = null;
        return () => {
          if (!scrollTimer) log("scroll-start", `top=${main.scrollTop}`);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            log("scroll-end", `top=${main.scrollTop}`);
            scrollTimer = null;
          }, 150);
        };
      })(),
      { signal },
    );
  }

  // ── 6. DOM mutations on the sidebar (React re-render, HMR style inject) ─
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "style") {
        log("style-attr-change", `new: "${sidebarEl.getAttribute("style")}"`);
      }
      if (m.type === "attributes" && m.attributeName === "class") {
        log("class-change", `new: "${sidebarEl.className}"`);
      }
      if (m.type === "childList") {
        log("child-change", `added=${m.addedNodes.length} removed=${m.removedNodes.length}`);
      }
    }
  });
  mo.observe(sidebarEl, { attributes: true, childList: true, subtree: false });

  // ── 7. Global style sheet mutations (HMR style injection) ───────────
  const headMo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === "stylesheet")) {
          log("stylesheet-injected", `tag=${node.tagName} id="${node.id}"`);
        }
      }
      for (const node of m.removedNodes) {
        if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === "stylesheet")) {
          log("stylesheet-removed", `tag=${node.tagName} id="${(node as HTMLElement).id}"`);
        }
      }
    }
  });
  headMo.observe(document.head, { childList: true });

  // ── 8. Vite HMR events ─────────────────────────────────────────────
  if (import.meta.hot) {
    import.meta.hot.on("vite:beforeUpdate", (payload) => {
      log("hmr-before-update", JSON.stringify(payload.updates.map((u: { path: string }) => u.path)));
    });
    import.meta.hot.on("vite:afterUpdate", (payload) => {
      log("hmr-after-update", JSON.stringify(payload.updates.map((u: { path: string }) => u.path)));
    });
    import.meta.hot.on("vite:beforeFullReload", () => {
      log("hmr-full-reload");
    });
  }

  // ── 9. Animation frame drops (jank detector) ───────────────────────
  let lastFrame = performance.now();
  let rafId = 0;
  function checkFrame(now: number) {
    const delta = now - lastFrame;
    if (delta > 50) {
      log("frame-drop", `${Math.round(delta)}ms gap`);
    }
    lastFrame = now;
    rafId = requestAnimationFrame(checkFrame);
  }
  rafId = requestAnimationFrame(checkFrame);

  // ── 10. Tauri window events (if available) ──────────────────────────
  if (typeof window.__TAURI__ !== "undefined") {
    import("@tauri-apps/api/event").then(({ listen }: { listen: Function }) => {
      listen("tauri://resize", () => log("tauri-resize")).catch(() => {});
      listen("tauri://move", () => log("tauri-move")).catch(() => {});
      listen("tauri://focus", () => log("tauri-focus")).catch(() => {});
      listen("tauri://blur", () => log("tauri-blur")).catch(() => {});
      listen("tauri://scale-change", (e: { payload: unknown }) => log("tauri-scale-change", JSON.stringify(e.payload))).catch(() => {});
      listen("tauri://theme-changed", (e: { payload: unknown }) => log("tauri-theme-changed", JSON.stringify(e.payload))).catch(() => {});
    }).catch(() => {});
  }

  // ── 11. Expose to devtools ──────────────────────────────────────────
  window.__blurDiag = {
    getLog: () => [...eventLog],
    dumpLog: () => {
      console.table(eventLog.map((e) => ({
        ms: Math.round(e.time),
        type: e.type,
        detail: e.detail?.slice(0, 80),
      })));
    },
    isBlurActive: () => {
      const cs = getComputedStyle(sidebarEl);
      return {
        backdropFilter: cs.backdropFilter,
        webkitBackdropFilter: cs.webkitBackdropFilter,
        transform: cs.transform,
        willChange: cs.willChange,
        opacity: cs.opacity,
        display: cs.display,
        visibility: cs.visibility,
      };
    },
  };

  log("ready", "diagnostics attached. Use window.__blurDiag.dumpLog() to review.");

  return () => {
    ac.abort();
    clearInterval(pollId);
    cancelAnimationFrame(rafId);
    mo.disconnect();
    headMo.disconnect();
    log("cleanup", "diagnostics detached");
  };
}
