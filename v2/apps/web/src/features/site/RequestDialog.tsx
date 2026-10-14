import type { SiteContent } from "@buad/schema/site";
import { useEffect, useRef, useState } from "react";
import { ApiError, ok } from "../../lib/format";
import type { RequestTarget } from "./site-api";

const ERRORS: Record<string, string> = {
  contact_required: "اكتب رقم الجوال أو البريد الإلكتروني لنتواصل معك.",
  missing_answers: "أجب عن الأسئلة المطلوبة.",
  rate_limited: "أرسلت طلبات كثيرة. حاول لاحقاً أو تواصل معنا عبر واتساب.",
  busy: "الخدمة مشغولة الآن. حاول لاحقاً أو تواصل معنا عبر واتساب.",
};

/** «اطلب عرضاً»: the public form. Answers the product's intake questions; lands in «الطلبات». */
const text = (v: string | undefined, d: string) => (v?.trim() ? v : d);

export function RequestDialog({
  target,
  open,
  onClose,
  form,
}: {
  target: RequestTarget;
  open: boolean;
  onClose: () => void;
  /** Wording and optional fields from the site settings. */
  form?: SiteContent["form"];
}) {
  const title = text(form?.title, "اطلب عرضاً");
  const submitLabel = text(form?.submitLabel, "إرسال الطلب");
  const success = text(form?.successMessage, "شكراً لك. سنتواصل معك قريباً بنموذج التنفيذ المناسب.");
  const showEntity = form?.showEntity ?? true;
  const showEmail = form?.showEmail ?? true;
  const showMessage = form?.showMessage ?? true;
  const [f, setF] = useState({
    name: "",
    entity: "",
    phone: "",
    email: "",
    message: "",
    website: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await ok(
        await fetch("/api/public/site/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...f, productSlug: target?.slug, answers }),
        }),
      );
      setDone(true);
    } catch (x) {
      const code = x instanceof ApiError ? String(x.body.error) : "";
      setError(ERRORS[code] ?? "تعذّر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rq-title">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 className="h3" id="rq-title">
            {done ? "وصلنا طلبك" : target ? `${title}: ${target.name}` : title}
          </h2>
          <button
            type="button"
            className="linklike"
            onClick={onClose}
            aria-label="إغلاق"
            style={{ fontSize: 24 }}
          >
            ×
          </button>
        </div>
        {done ? (
          <div className="list">
            <p className="body">{success}</p>
            <button type="button" className="btn primary" onClick={onClose}>
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="list" noValidate>
            {form?.intro && <p className="body">{form.intro}</p>}
            <label className="fld">
              الاسم
              <input
                ref={first}
                required
                value={f.name}
                onChange={set("name")}
                autoComplete="name"
              />
            </label>
            {showEntity && (
              <label className="fld">
                الجهة
                <input value={f.entity} onChange={set("entity")} autoComplete="organization" />
              </label>
            )}
            <div className="g2">
              <label className="fld">
                الجوال
                <input
                  type="tel"
                  dir="ltr"
                  value={f.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                />
              </label>
              {showEmail && (
                <label className="fld">
                  البريد الإلكتروني
                  <input
                    type="email"
                    dir="ltr"
                    value={f.email}
                    onChange={set("email")}
                    autoComplete="email"
                  />
                </label>
              )}
            </div>
            {target?.intake.map((q) => (
              <div key={q.key} className="fld">
                <span id={`q-${q.key}`}>
                  {q.label}
                  {q.required && " *"}
                </span>
                {q.type === "select" ? (
                  <select
                    aria-labelledby={`q-${q.key}`}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                  >
                    <option value="">اختر</option>
                    {q.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : q.type === "multi" ? (
                  <div className="opts" role="group" aria-labelledby={`q-${q.key}`}>
                    {q.options.map((o) => {
                      const cur = (answers[q.key] ?? "").split("، ").filter(Boolean);
                      return (
                        <label key={o}>
                          <input
                            type="checkbox"
                            style={{ width: "auto" }}
                            checked={cur.includes(o)}
                            onChange={(e) =>
                              setAnswers((a) => ({
                                ...a,
                                [q.key]: (e.target.checked
                                  ? [...cur, o]
                                  : cur.filter((x) => x !== o)
                                ).join("، "),
                              }))
                            }
                          />
                          {o}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    aria-labelledby={`q-${q.key}`}
                    type={q.type === "number" ? "number" : "text"}
                    min={q.type === "number" ? 0 : undefined}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {showMessage && (
              <label className="fld">
                ملاحظات
                <textarea rows={3} value={f.message} onChange={set("message")} />
              </label>
            )}
            {/* Honeypot: invisible to people, tempting to bots. */}
            <div className="hp" aria-hidden="true">
              <label>
                الموقع
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={f.website}
                  onChange={set("website")}
                />
              </label>
            </div>
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn primary"
              disabled={busy || f.name.trim().length < 2}
            >
              {busy ? "جارٍ الإرسال…" : submitLabel}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
