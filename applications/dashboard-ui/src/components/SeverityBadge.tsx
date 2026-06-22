import clsx from "clsx";
import type { Severity } from "@/lib/types";

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx("badge", {
      "badge-critical": severity === "critical",
      "badge-high":     severity === "high",
      "badge-medium":   severity === "medium",
      "badge-low":      severity === "low",
    })}>
      {severity}
    </span>
  );
}
