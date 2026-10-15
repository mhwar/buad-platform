import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "buad-theme";
/** null where the browser cannot report the system preference (very old browsers, tests). */
const media = (): MediaQueryList | null =>
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

const read = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && !!media()?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Light / dark / follow the device. Saved per browser; "system" keeps following OS changes. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  useEffect(() => {
    applyTheme(choice);
    try {
      choice === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, choice);
    } catch {
      /* private mode: still applies for this visit */
    }
    if (choice !== "system") return;
    const m = media();
    if (!m) return;
    const onChange = () => applyTheme("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [choice]);
  return [choice, setChoice] as const;
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<ThemeChoice, string> = {
  light: "النمط النهاري",
  dark: "النمط الليلي",
  system: "حسب الجهاز",
};

/** One button that cycles نهاري → ليلي → حسب الجهاز, and says which one is active. */
/** `onDark` is for use on the brand-coloured header. */
export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const [choice, setChoice] = useTheme();
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setChoice(NEXT[choice])}
      title={`${LABEL[choice]} — اضغط للتبديل إلى ${LABEL[NEXT[choice]]}`}
      aria-label={`المظهر: ${LABEL[choice]}. اضغط للتبديل إلى ${LABEL[NEXT[choice]]}`}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${
        onDark
          ? "border-white/20 text-white/85 hover:bg-white/10 hover:text-white"
          : "text-muted hover:text-ink"
      }`}
    >
      <Icon className="size-4" />
      <span className="hidden text-xs md:inline">{LABEL[choice]}</span>
    </button>
  );
}
