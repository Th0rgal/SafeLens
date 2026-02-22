import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SettingsConfigProvider } from "./lib/settings/hooks";
import { ToastProvider } from "./components/ui/toast";
import { Sidebar, type NavId } from "./components/sidebar";
import VerifyScreen from "./screens/VerifyScreen";

const AddressBookScreen = lazy(() => import("./screens/AddressBookScreen"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));
const ERC7730Screen = lazy(() => import("./screens/ERC7730Screen"));

/*
 * Window dragging - DO NOT remove or replace with data-tauri-drag-region.
 *
 * Tauri's native data-tauri-drag-region attribute is unreliable with
 * overlay titlebars (titleBarStyle: "Overlay") on macOS: clicks pass
 * through or are swallowed depending on z-index and stacking context.
 *
 * Instead we use a programmatic approach: a global mousedown listener
 * checks whether the click lands inside a .drag-region element (and not
 * on an interactive control), then calls appWindow.startDragging().
 *
 * This requires the Tauri allowlist to include "window-start-dragging"
 * (tauri.conf.json) and the corresponding Cargo feature in Cargo.toml.
 * Double-click on the drag region toggles maximize/restore.
 *
 * Debug: Cmd+Shift+D highlights drag regions in red.
 */
const NO_DRAG_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "label",
  "[role='button']",
  "[contenteditable='true']",
  ".no-drag",
].join(",");

export default function App() {
  const [active, setActive] = useState<NavId>("verify");
  const [debugDrag, setDebugDrag] = useState(false);

  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const inDragRegion = target.closest(".drag-region");
      if (!inDragRegion) return;
      if (target.closest(NO_DRAG_SELECTOR)) return;

      e.preventDefault();
      try {
        const win = getCurrentWindow();
        if (e.detail === 2) {
          const maximized = await win.isMaximized();
          if (maximized) await win.unmaximize();
          else await win.maximize();
        } else {
          await win.startDragging();
        }
      } catch {
        // Window drag unavailable
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === "d") {
        e.preventDefault();
        setDebugDrag((v) => !v);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <SettingsConfigProvider>
      <ToastProvider>
        <div className={`relative flex h-screen w-full overflow-hidden ${debugDrag ? "debug-drag" : ""}`}>
          {/* Drag strip - must span full window width and sit above all content
              (z-50) so the programmatic mousedown handler can detect it.
              Height matches the macOS traffic-light inset. See block comment above. */}
          <div className="drag-region absolute inset-x-0 top-0 z-50 h-[52px]" />
          <Sidebar active={active} onNavigate={setActive} />
          <main className="flex-1 min-w-0 overflow-y-auto bg-bg">
            <div className="px-8 pt-14 pb-8">
              <div className={active !== "verify" ? "hidden" : undefined}>
                <VerifyScreen />
              </div>
              <Suspense>
                {active === "address-book" && <AddressBookScreen />}
                {active === "erc7730" && <ERC7730Screen />}
                {active === "settings" && <SettingsScreen />}
              </Suspense>
            </div>
          </main>
        </div>
      </ToastProvider>
    </SettingsConfigProvider>
  );
}
