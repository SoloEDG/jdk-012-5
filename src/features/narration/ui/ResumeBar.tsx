import { History, Play, X } from "lucide-react";
import { artworkById } from "../../../shared/catalog";
import type { SegmentRecords } from "../../../shared/types";
import type { NarrationSnapshot } from "../../../shared/storage";
import { pendingSegmentIndexes } from "../lib/listening";

export function ResumeBar({
  snapshot,
  records,
  onResume,
  onDismiss,
}: {
  snapshot: NarrationSnapshot;
  records: SegmentRecords;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const a = artworkById(snapshot.artworkId);
  if (!a) return null;
  const pending = pendingSegmentIndexes(records, a);
  const langLabel = snapshot.lang === "en" ? "English（英文轨道）" : "中文原声";
  return (
    <div className="resume-bar" role="status">
      <History size={18} aria-hidden />
      <div className="resume-text">
        <strong>继续参观？</strong>
        <span>
          当前语言：{langLabel}；《{a.title}》还有 {pending.length} 段未完成
          （从第 {snapshot.segmentIndex + 1} 段继续，恢复后保持暂停）。
        </span>
      </div>
      <button className="primary" onClick={onResume}>
        <Play size={15} /> 继续
      </button>
      <button
        className="icon-button"
        aria-label="关闭恢复提示"
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}
