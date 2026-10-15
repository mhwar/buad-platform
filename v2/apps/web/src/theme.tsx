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

/** «المظهر»: the colour mode, chosen here and saved on this device. */
export function AppearanceCard() {
  const [choice, setChoice] = useTheme();
  const options: { value: ThemeChoice; label: string; Icon: typeof Sun; hint: string }[] = [
    { value: "light", label: "نهاري", Icon: Sun, hint: "خلفية فاتحة" },
    { value: "dark", label: "ليلي", Icon: Moon, hint: "خلفية داكنة مريحة للعين" },
    { value: "system", label: "حسب الجهاز", Icon: Monitor, hint: "يتبع إعداد جهازك" },
  ];
  return (
    <section
      aria-labelledby="appearance"
      className="max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 id="appearance" className="mb-1 text-lg font-bold">
        المظهر
      </h2>
      <p className="mb-4 text-sm text-muted">نمط الألوان على هذا الجهاز.</p>
      <div role="radiogroup" aria-labelledby="appearance" className="grid gap-2 sm:grid-cols-3">
        {options.map(({ value, label, Icon, hint }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => setChoice(value)}
            className={`flex min-h-16 flex-col items-start gap-1 rounded-xl border p-3 text-start transition ${
              choice === value ? "border-brand bg-brand-soft text-brand" : "hover:bg-brand-soft/50"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4" />
              {label}
            </span>
            <span className="text-xs text-muted">{hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
