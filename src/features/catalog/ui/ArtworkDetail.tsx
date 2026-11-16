import { Heart, Headphones, ArrowUpRight } from "lucide-react";
import { artworkById } from "../../../shared/catalog";
import type { SegmentRecords } from "../../../shared/types";
import { artworkListening, outcomeLabel } from "../../narration";

export function ArtworkDetail({
  id,
  saved,
  records,
  activeSegmentId,
  onFavorite,
  onListen,
  onGo,
}: {
  id: string | null;
  saved: boolean;
  records: SegmentRecords;
  activeSegmentId?: string | null;
  onFavorite: () => void;
  onListen: () => void;
  onGo: () => void;
}) {
  const a = artworkById(id);
  if (!a) return <div>靠近一件作品，开始探索。</div>;
  const listening = artworkListening(records, a);
  const map = records[a.id] || {};
  return (
    <section className="detail">
      <div className="eyebrow">
        ARTWORK INSIGHT <span>作品档案</span>
      </div>
      <div className={"art-preview art-" + a.id}>
        <span>{a.en}</span>
      </div>
      <div className="detail-heading">
        <h2>{a.title}</h2>
        <button
          className={saved ? "icon-button saved" : "icon-button"}
          aria-label={saved ? "取消收藏" : "收藏作品"}
          onClick={onFavorite}
        >
          <Heart size={20} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <p className="artist">
        {a.artist} <span>/</span> {a.year}
      </p>
      <p className="medium">{a.medium}</p>
      <p className="description">{a.description}</p>

      <div className="segment-list" aria-label="语义段落与收听状态">
        {a.segments.map((s, i) => {
          const outcome = map[s.id];
          return (
            <div
              key={s.id}
              className={
                "segment-row" +
                (activeSegmentId === s.id ? " active" : "") +
                (outcome ? " " + outcome : "")
              }
            >
              <span className="segment-index" aria-hidden>
                {i + 1}
              </span>
              <div>
                <p>{s.zh}</p>
                {s.en && <small>{s.en}</small>}
                <small className="segment-highlight">◈ {s.highlight}</small>
              </div>
              <em className={"segment-outcome " + (outcome || "pending")}>
                {outcomeLabel(outcome)}
              </em>
            </div>
          );
        })}
      </div>
      <p className="listening-summary">
        听过 {listening.heard}/{listening.total} 段 · 只看过 {listening.watched}{" "}
        段 · 已跳过 {listening.skipped} 段
      </p>

      <div className="detail-actions">
        <button className="primary" onClick={onListen}>
          <Headphones size={16} />
          收听作品讲解
        </button>
        <button className="text-button" onClick={onGo}>
          前往作品
          <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
