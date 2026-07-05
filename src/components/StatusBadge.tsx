import type { RobotState } from "../types";
import { statusLabel } from "../lib/mcFlow";

interface StatusBadgeProps {
  state: RobotState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${state}`}>{statusLabel(state)}</span>;
}
