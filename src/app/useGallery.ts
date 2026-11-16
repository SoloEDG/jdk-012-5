import { useEffect, useRef } from "react";
import { useWalker, distance, viewingPoint } from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour } from "../features/tours";
import { useCollection } from "../features/collection";
import { artworkById } from "../shared/catalog";
import {
  loadSnapshot,
  saveSnapshot,
  type NarrationSnapshot,
} from "../shared/storage";
import { artworkListening } from "../features/narration/lib/listening";

export function useGallery() {
  const catalog = useCatalog();
  const tour = useTour();
  const collection = useCollection();
  const walker = useWalker(catalog.observe);

  const narration = useNarration({
    // 只有“自然播完”才自动进入下一站
    onComplete: (artworkId) => {
      if (tour.state.phase === "listening") {
        const l = artworkListening(collection.document.segments, artworkById(artworkId)!);
        tour.markStop(l.hasHeard ? "heard" : "watched");
        tour.next();
      }
    },
    onOutcome: (artworkId, segmentId, outcome) =>
      collection.recordOutcome(artworkId, segmentId, outcome),
    onSnapshot: (s) =>
      saveSnapshot({ ...s, savedAt: Date.now() }),
  });

  const go = (id: string) => {
    const a = artworkById(id);
    if (a) {
      catalog.select(id);
      walker.go(viewingPoint(a.position, a.facing));
      walker.yaw.current = a.facing;
    }
  };

  // 导览步行阶段：自动前往目标作品
  useEffect(() => {
    if (tour.state.phase === "walking" && tour.target) go(tour.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.state.phase, tour.target]);

  // 到站：进入讲解并自动播放（新 session 由 useNarration 内部令牌保证不串台）
  useEffect(() => {
    if (tour.state.phase !== "walking" || !tour.target) return;
    const a = artworkById(tour.target)!;
    if (distance(walker.position, viewingPoint(a.position, a.facing)) < 0.15) {
      tour.arrive();
      narration.play(a.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walker.position, tour.state.phase, tour.target]);

  const current = useRef({ nearby: catalog.nearby, record: collection.record });
  current.current = { nearby: catalog.nearby, record: collection.record };
  useEffect(() => {
    const t = setInterval(() => {
      if (current.current.nearby)
        current.current.record(current.current.nearby, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /** 手动下一站：当前作品剩余段落先诚实记为跳过 */
  const nextTour = () => {
    if (narration.state.artworkId) {
      narration.skipArtwork();
      tour.markStop("skipped");
    }
    walker.stop();
    tour.next();
  };

  const pauseTour = () => {
    tour.pause();
    walker.stop();
    narration.pause();
  };

  const stopTour = () => {
    walker.stop();
    narration.pause();
    tour.stop();
  };

  /** 恢复参观：应用快照（保持暂停），并走到对应作品 */
  const restoreSnapshot = (s: NarrationSnapshot) => {
    narration.resume(s);
    go(s.artworkId);
  };

  const dismissSnapshot = () => saveSnapshot(null);

  return {
    catalog,
    tour,
    collection,
    walker,
    narration,
    go,
    pauseTour,
    stopTour,
    nextTour,
    snapshot: loadSnapshot,
    restoreSnapshot,
    dismissSnapshot,
  };
}
