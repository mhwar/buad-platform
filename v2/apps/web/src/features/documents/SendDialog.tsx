import { DOC_KIND_LABELS } from "@buad/schema/documents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Mail, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, Field, Input, Notice, Select } from "../../components/ui";
import { ago, fromEpoch, whatsapp } from "../../lib/format";
import { type DocDetail, docApi } from "./api";

const CHANNEL: Record<string, string> = { whatsapp: "واتساب", email: "بريد", link: "رابط" };

/**
 * «إرسال»: an expiring link to the approved document, sent by WhatsApp or e-mail
 * (from the user's own apps) or copied. Earlier links are listed and can be revoked.
 */
export function SendDialog({ detail, onClose }: { detail: DocDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const d = detail.document;
  const v = (k: string) => detail.values[k]?.value ?? "";
  const [days, setDays] = useState<7 | 30>(7);
  const [phone, setPhone] = useState(v("party_b_phone"));
  const [email, setEmail] = useState(v("party_b_email"));
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shares = useQuery({
    queryKey: ["documents", "shares", d.id],
    queryFn: () => docApi.shares(d.id),
  });

  const message = (url: string, expiresAt: number) =>
    [
      "السلام عليكم ورحمة الله وبركاته،",
      `نرسل لكم ${DOC_KIND_LABELS[d.kind]} «${d.title}» من ${detail.org.name}.`,
      `للاطلاع والتنزيل: ${url}`,
      `(الرابط صالح حتى ${fromEpoch(expiresAt)})`,
    ].join("\n");

  const create = async (channel: "whatsapp" | "email" | "link") => {
    setError(null);
    const r = await docApi.share(d.id, days, channel);
    const url = `${window.location.origin}${r.path}`;
    setLink({ url, expiresAt: r.expiresAt });
    await qc.invalidateQueries({ queryKey: ["documents", "shares", d.id] });
    return { url, expiresAt: r.expiresAt };
  };

  const viaWhatsapp = async () => {
    // Opened now (inside the click) so the browser does not block it as a pop-up.
    const w = window.open("about:blank", "_blank");
    try {
      const { url, expiresAt } = await create("whatsapp");
      const to = whatsapp(phone);
      const href = `https://wa.me/${to}?text=${encodeURIComponent(message(url, expiresAt))}`;
      if (w) w.location.href = href;
      else window.location.href = href;
    } catch {
      w?.close();
      setError("تعذّر إنشاء الرابط");
    }
  };
  const viaEmail = async () => {
    try {
      const { url, expiresAt } = await create("email");
      const subject = `${DOC_KIND_LABELS[d.kind]}: ${d.title}`;
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message(url, expiresAt))}`;
    } catch {
      setError("تعذّر إنشاء الرابط");
    }
  };
  const copy = async () => {
    try {
      const { url } = link ?? (await create("link"));
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      setError("تعذّر إنشاء الرابط");
    }
  };

  const live = (shares.data ?? []).filter((s) => !s.revokedAt && s.expiresAt > Date.now() / 1000);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`إرسال ${DOC_KIND_LABELS[d.kind]}`}>
      <p className="mb-4 text-sm text-muted">
        يصل المستلم رابط خاص يفتح النسخة المعتمدة للاطلاع والتنزيل دون حساب. الرابط ينتهي تلقائياً
        ويمكن إلغاؤه في أي وقت.
      </p>
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="صلاحية الرابط">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30)}>
            <option value={7}>7 أيام</option>
            <option value={30}>30 يوماً</option>
          </Select>
        </Field>
        <Field label="جوال المستلم">
          <Input
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </Field>
        <Field label="بريد المستلم">
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={viaWhatsapp} disabled={!whatsapp(phone)}>
          <MessageCircle className="size-4" /> واتساب
        </Button>
        <Button variant="secondary" onClick={viaEmail} disabled={!email.includes("@")}>
          <Mail className="size-4" /> بريد
        </Button>
        <Button variant="secondary" onClick={copy}>
          {copied ? <Link2 className="size-4" /> : <Copy className="size-4" />}
          {copied ? "نُسخ الرابط" : "نسخ الرابط"}
        </Button>
        <Button
          variant="secondary"
          disabled
          title="يتاح بعد ربط الدومين وخدمة البريد"
          aria-label="إرسال بالبريد من المنصة (يتاح بعد ربط الدومين)"
        >
          <Send className="size-4" /> من المنصة (قريباً)
        </Button>
      </div>
      {!whatsapp(phone) && phone && (
        <p className="mt-2 text-xs text-muted">رقم الجوال غير صالح لواتساب (مثال: 0551234567).</p>
      )}
      {link && (
        <p className="mt-3 break-all rounded-lg bg-brand-soft px-3 py-2 text-xs" dir="ltr">
          {link.url}
        </p>
      )}

      <h3 className="mt-6 mb-2 text-sm font-semibold">الروابط الفعّالة ({live.length})</h3>
      {live.length === 0 ? (
        <p className="text-xs text-muted">لم يُرسل هذا المستند بعد.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {live.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                {CHANNEL[s.channel] ?? "رابط"} · أُنشئ {ago(s.createdAt)}
                <span className="block text-xs text-muted">
                  ينتهي {fromEpoch(s.expiresAt)} ·{" "}
                  {s.views ? `فُتح ${s.views} مرة، آخرها ${ago(s.lastViewedAt)}` : "لم يُفتح بعد"}
                </span>
              </span>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!confirm("إلغاء هذا الرابط؟ لن يفتح بعد الآن.")) return;
                  await docApi.revokeShare(d.id, s.id);
                  await qc.invalidateQueries({ queryKey: ["documents", "shares", d.id] });
                }}
              >
                إلغاء
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
