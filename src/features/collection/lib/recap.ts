import type { Artwork, GalleryDocument } from "../../../shared/types";
import { artworkById, artworks } from "../../../shared/catalog";
import { artworkListening } from "../../narration/lib/listening";

export function recapStats(d: GalleryDocument) {
  let heardCount = 0;
  let watchedOnly = 0;
  let skippedCount = 0;
  for (const a of artworks) {
    const l = artworkListening(d.segments, a);
    if (l.heard > 0) heardCount++;
    else if (l.watched > 0) watchedOnly++;
    if (l.skipped > 0) skippedCount += l.skipped;
  }
  return {
    seen: d.visits.filter((v) => v.seconds >= 2).length,
    heard: heardCount,
    watchedOnly,
    skipped: skippedCount,
    seconds: Math.round(d.visits.reduce((n, v) => n + v.seconds, 0)),
    saved: d.favorites.length,
  };
}

function listeningLine(a: Artwork, d: GalleryDocument): string {
  const l = artworkListening(d.segments, a);
  return `收听：听过 ${l.heard}/${l.total} 段 · 只看过 ${l.watched} 段 · 已跳过 ${l.skipped} 段`;
}

export function createRecap(d: GalleryDocument): string {
  const stats = recapStats(d);
  return [
    "余境 · 我的参观回顾",
    `观看 ${stats.seen} 件作品 · 听过讲解 ${stats.heard} 件 · 仅字幕看过 ${stats.watchedOnly} 件 · 跳过段落 ${stats.skipped} 段`,
    `停留 ${stats.seconds} 秒 · 收藏 ${stats.saved} 件`,
    "",
    ...d.favorites.map((id) => {
      const a = artworkById(id);
      return a
        ? `${a.title} / ${a.artist}
${d.notes[id] || "未添加感想"}
停留 ${Math.round(d.visits.find((v) => v.id === id)?.seconds || 0)} 秒
${listeningLine(a, d)}`
        : "";
    }),
    "",
    "全部作品收听记录：",
    ...artworks.map((a) => `- ${a.title}：${listeningLine(a, d)}`),
  ].join("\n");
}
