import { useState } from "react";
import type { SegmentOutcome, TourState } from "../../../shared/types";
import { routes } from "../../../shared/catalog";
import { tourTarget, tourRoute } from "../lib/routeProgress";

const initial: TourState = {
  routeId: null,
  step: 0,
  phase: "idle",
  stopOutcomes: [],
};

export function useTour() {
  const [state, setState] = useState<TourState>(initial);
  return {
    state,
    target: tourTarget(state),
    start: (id: string) => {
      const r = routes.find((x) => x.id === id);
      if (r)
        setState({
          routeId: id,
          step: 0,
          phase: "walking",
          stopOutcomes: r.stops.map(() => "skipped"),
        });
    },
    arrive: () =>
      setState((t) =>
        t.phase === "walking" ? { ...t, phase: "listening" } : t,
      ),
    next: () =>
      setState((t) => {
        const r = tourRoute(t);
        if (!r) return t;
        return t.step + 1 >= r.stops.length
          ? { ...t, phase: "done" }
          : { ...t, step: t.step + 1, phase: "walking" };
      }),
    /** 记录当前站的真实结局；heard 优先于 watched 优先于 skipped */
    markStop: (outcome: SegmentOutcome) =>
      setState((t) => {
        if (t.phase === "idle" || t.phase === "done") return t;
        const rank: Record<SegmentOutcome, number> = {
          heard: 3,
          watched: 2,
          skipped: 1,
        };
        const stopOutcomes = t.stopOutcomes.slice();
        if (rank[outcome] > rank[stopOutcomes[t.step] || "skipped"])
          stopOutcomes[t.step] = outcome;
        return { ...t, stopOutcomes };
      }),
    pause: () => setState((t) => ({ ...t, phase: "paused" })),
    resume: () => setState((t) => ({ ...t, phase: "walking" })),
    stop: () => setState(initial),
  };
}
