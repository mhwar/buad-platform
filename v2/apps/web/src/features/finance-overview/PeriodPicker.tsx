import { Input, Segmented, Select } from "../../components/ui";
import type { PeriodChoice } from "./api";

const now = new Date();

/** Year / quarter / all / custom — one period control for every finance view. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodChoice;
  onChange: (patch: PeriodChoice) => void;
}) {
  const preset = value.preset === "last" ? "year" : (value.preset ?? "all");
  const year = value.year ?? now.getFullYear() - (value.preset === "last" ? 1 : 0);
  const q = value.q ?? Math.floor(now.getMonth() / 3) + 1;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="الفترة"
        value={preset}
        onChange={(e) => onChange({ preset: e.target.value as PeriodChoice["preset"], year, q })}
        className="w-auto"
      >
        <option value="all">كل الفترات</option>
        <option value="quarter">ربع سنة</option>
        <option value="year">سنة كاملة</option>
        <option value="custom">فترة مخصصة</option>
      </Select>
      {(preset === "quarter" || preset === "year") && (
        <Select
          aria-label="السنة"
          value={year}
          onChange={(e) => onChange({ preset, year: Number(e.target.value), q })}
          className="w-auto"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      )}
      {preset === "quarter" && (
        <Segmented
          inline
          label="الربع"
          value={String(q)}
          onChange={(v) => onChange({ preset, year, q: Number(v) })}
          items={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `ر${n}` }))}
        />
      )}
      {preset === "custom" && (
        <span className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            aria-label="من"
            value={value.from ?? ""}
            onChange={(e) => onChange({ preset, from: e.target.value || undefined, to: value.to })}
            className="w-auto"
          />
          <span className="text-muted">إلى</span>
          <Input
            type="date"
            aria-label="إلى"
            value={value.to ?? ""}
            onChange={(e) =>
              onChange({ preset, from: value.from, to: e.target.value || undefined })
            }
            className="w-auto"
          />
        </span>
      )}
    </div>
  );
}
