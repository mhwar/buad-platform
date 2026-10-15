import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/** The pages reached from «الفرص» (offers, analytics, follow-ups): a title and the way back. */
export function SalesCrumb({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <nav aria-label="مسار التنقل" className="mb-1 flex items-center gap-1 text-sm text-muted">
        <Link to="/sales" className="hover:text-ink">
          الفرص
        </Link>
        <ChevronLeft className="size-3.5" />
      </nav>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
