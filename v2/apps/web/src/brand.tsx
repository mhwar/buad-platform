import { ThemeToggle } from "./theme";

/** The one place the logo is defined. Files live in /public and come from v1's /assets, unchanged. */
type Props = {
  variant?: "full" | "icon";
  /** "adaptive" follows the colour scheme; "light" is for use on a dark/brand surface. */
  tone?: "adaptive" | "light";
  className?: string;
};

export function Logo({ variant = "full", tone = "adaptive", className = "" }: Props) {
  const tint = tone === "light" ? "logo-on-dark" : "logo-adaptive";
  return (
    <img
      src={variant === "full" ? "/logo.svg" : "/logo-icon.svg"}
      alt="بُعد"
      className={`${tint} ${className}`}
      draggable={false}
    />
  );
}

/** Shared frame for signed-out pages (login, first-time setup): brand panel + content. */
export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-2 lg:grid-rows-1">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-[#00197d] px-6 py-6 text-white lg:p-12">
        <Logo tone="light" className="h-14 w-auto self-start lg:h-28" />
        <div className="hidden max-w-md lg:block">
          <p className="text-3xl font-bold leading-snug">
            منصة واحدة لإدارة مشاريعكم وجمعياتكم وحوكمتكم
          </p>
          <p className="mt-4 text-white/70">بُعد التمكين</p>
        </div>
        <Logo
          variant="icon"
          tone="light"
          className="pointer-events-none absolute -bottom-28 -right-28 hidden h-[30rem] w-auto opacity-[0.08] lg:block"
        />
      </aside>
      <main className="relative flex items-center justify-center p-6">
        <div className="absolute top-4 left-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
    >
      {children}
    </p>
  );
}
