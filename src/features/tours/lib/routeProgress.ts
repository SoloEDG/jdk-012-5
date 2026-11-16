import { routes } from "../../../shared/catalog";
import type { SegmentOutcome, TourState } from "../../../shared/types";

export function tourRoute(t: TourState) {
  return routes.find((r) => r.id === t.routeId);
}

export function tourTarget(t: TourState): string | null {
  return tourRoute(t)?.stops[t.step] || null;
}

/** 进度只认真实消费（听过 / 只看过），手动跳过不计入完成 */
export function tourProgress(t: TourState): number {
  const r = tourRoute(t);
  if (!r) return 0;
  if (t.phase === "done") {
    const consumed = t.stopOutcomes.filter(
      (o) => o === "heard" || o === "watched",
    ).length;
    return consumed / r.stops.length;
  }
  const consumed = t.stopOutcomes
    .slice(0, t.step)
    .filter((o) => o === "heard" || o === "watched").length;
  return consumed / r.stops.length;
}

export function stopOutcomeLabel(o: SegmentOutcome | undefined): string {
  if (o === "heard") return "听过";
  if (o === "watched") return "只看过";
  if (o === "skipped") return "已跳过";
  return "未开始";
}
