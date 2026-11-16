import type { GalleryDocument, Lang, SegmentOutcome } from "./types";

const key = "yujing-gallery-v2";
const legacyKey = "yujing-gallery-v1";
const snapshotKey = "yujing-narration-snapshot-v1";

export const emptyDocument = (): GalleryDocument => ({
  favorites: [],
  visits: [],
  notes: {},
  segments: {},
});

function isOutcome(v: unknown): v is SegmentOutcome {
  return v === "heard" || v === "watched" || v === "skipped";
}

/** 恢复参观用的播放快照 */
export type NarrationSnapshot = {
  artworkId: string;
  lang: Lang;
  segmentIndex: number;
  rate: number;
  savedAt: number;
};

export function loadDocument(): GalleryDocument {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    // 兼容 v1：旧版没有段落记录，迁移为空记录
    const legacy = raw
      ? null
      : JSON.parse(localStorage.getItem(legacyKey) || "null");
    const d = raw || legacy;
    if (!d) return emptyDocument();
    const segments: GalleryDocument["segments"] = {};
    if (d.segments && typeof d.segments === "object") {
      for (const [artId, map] of Object.entries(
        d.segments as Record<string, unknown>,
      )) {
        if (!map || typeof map !== "object") continue;
        const clean: Record<string, SegmentOutcome> = {};
        for (const [segId, outcome] of Object.entries(
          map as Record<string, unknown>,
        )) {
          if (isOutcome(outcome)) clean[segId] = outcome;
        }
        if (Object.keys(clean).length) segments[artId] = clean;
      }
    }
    return {
      favorites: Array.isArray(d.favorites)
        ? d.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      visits: Array.isArray(d.visits)
        ? d.visits.filter(
            (v: { id?: unknown; seconds?: unknown }) =>
              typeof v.id === "string" && typeof v.seconds === "number",
          )
        : [],
      notes: typeof d.notes === "object" && d.notes ? d.notes : {},
      segments,
    };
  } catch {
    return emptyDocument();
  }
}

export function saveDocument(d: GalleryDocument): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadSnapshot(): NarrationSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(snapshotKey) || "null");
    if (
      s &&
      typeof s.artworkId === "string" &&
      (s.lang === "zh" || s.lang === "en") &&
      typeof s.segmentIndex === "number"
    ) {
      return {
        artworkId: s.artworkId,
        lang: s.lang,
        segmentIndex: s.segmentIndex,
        rate: typeof s.rate === "number" ? s.rate : 1,
        savedAt: typeof s.savedAt === "number" ? s.savedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSnapshot(s: NarrationSnapshot | null): boolean {
  try {
    if (s) localStorage.setItem(snapshotKey, JSON.stringify(s));
    else localStorage.removeItem(snapshotKey);
    return true;
  } catch {
    return false;
  }
}
