import {
  Activity,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Car,
  ChartColumn,
  Check,
  Clock,
  Code,
  Globe,
  House,
  Lock,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Settings,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";

/** Content stores an icon *name*; this draws it (shared by the builder and the public site). */
export const ICONS: Record<string, LucideIcon> = {
  clock: Clock,
  globe: Globe,
  alert: TriangleAlert,
  settings: Settings,
  home: House,
  car: Car,
  lock: Lock,
  users: Users,
  check: Check,
  chart: ChartColumn,
  book: BookOpen,
  pulse: Activity,
  chat: MessageCircle,
  badge: BadgeCheck,
  briefcase: Briefcase,
  code: Code,
  megaphone: Megaphone,
  truck: Truck,
};

export const ICON_LABEL: Record<string, string> = {
  clock: "ساعة",
  globe: "مدينة",
  alert: "تنبيه",
  settings: "تجهيز",
  home: "سكن",
  car: "مركبة",
  lock: "أمان",
  users: "أشخاص",
  check: "تم",
  chart: "تقارير",
  book: "سجل",
  pulse: "مؤشر",
  chat: "تواصل",
  badge: "اعتماد",
  briefcase: "أعمال",
  code: "تقنية",
  megaphone: "تسويق",
  truck: "لوجستيات",
};

export function Icon({ name, className }: { name?: string; className?: string }) {
  const C = (name && ICONS[name]) || Check;
  return <C className={className} aria-hidden="true" />;
}
