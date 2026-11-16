import type {
  Artwork,
  SegmentOutcome,
  SegmentRecords,
} from "../../../shared/types";

/** 记录某段结局。heard/watched 不会被更弱的状态覆盖；skipped 只在尚无记录时写入 */
export function recordOutcome(
  records: SegmentRecords,
  artworkId: string,
  segmentId: string,
  outcome: SegmentOutcome,
): SegmentRecords {
  const existing = records[artworkId]?.[segmentId];
  if (existing === "heard" || existing === "watched") {
    // 已经真实消费过的段落，跳过/重复观看不能降级
    if (outcome === "skipped") return records;
    if (existing === "heard") return records;
  }
  const map = records[artworkId] || {};
  return { ...records, [artworkId]: { ...map, [segmentId]: outcome } };
}

/** 批量把未完成段落标为跳过（手动跳过 / 手动下一站），已完成段落保持不变 */
export function markRemainingSkipped(
  records: SegmentRecords,
  a: Artwork,
  fromIndex: number,
): SegmentRecords {
  let next = records;
  for (let i = Math.max(0, fromIndex); i < a.segments.length; i++) {
    next = recordOutcome(next, a.id, a.segments[i].id, "skipped");
  }
  return next;
}

export type ArtworkListening = {
  heard: number;
  watched: number;
  skipped: number;
  total: number;
  /** 至少一段真实听到语音 */
  hasHeard: boolean;
  /** 全部段落都已结局（heard/watched/skipped 任一） */
  isComplete: boolean;
  /** 完整收听：每一段都是 heard */
  isFullyHeard: boolean;
};

export function artworkListening(
  records: SegmentRecords,
  a: Artwork,
): ArtworkListening {
  const map = records[a.id] || {};
  let heard = 0,
    watched = 0,
    skipped = 0;
  for (const s of a.segments) {
    const o = map[s.id];
    if (o === "heard") heard++;
    else if (o === "watched") watched++;
    else if (o === "skipped") skipped++;
  }
  const decided = heard + watched + skipped;
  return {
    heard,
    watched,
    skipped,
    total: a.segments.length,
    hasHeard: heard > 0,
    isComplete: decided === a.segments.length,
    isFullyHeard: heard === a.segments.length,
  };
}

/** 尚未完成（没有任何结局）的段落索引，用于恢复参观提示 */
export function pendingSegmentIndexes(
  records: SegmentRecords,
  a: Artwork,
): number[] {
  const map = records[a.id] || {};
  return a.segments
    .map((s, i) => (map[s.id] ? -1 : i))
    .filter((i) => i >= 0);
}

export function outcomeLabel(o: SegmentOutcome | undefined): string {
  if (o === "heard") return "听过";
  if (o === "watched") return "只看过";
  if (o === "skipped") return "已跳过";
  return "未开始";
}
