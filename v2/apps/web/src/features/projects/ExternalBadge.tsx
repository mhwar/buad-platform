import { Badge } from "../../components/ui";

/** «خارجي»: the project is tracked for work only and never counted in finance. */
export function ExternalBadge() {
  return (
    <span title="مشروع خارجي: لا يدخل في أي رقم مالي">
      <Badge tone="gray">خارجي</Badge>
    </span>
  );
}
