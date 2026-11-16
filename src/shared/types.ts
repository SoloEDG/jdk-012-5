export type Point = { x: number; z: number };

/** 讲解语言：zh 为原声，en 为译制轨道 */
export type Lang = "zh" | "en";

/** 一个语义段落的收听结局 */
export type SegmentOutcome = "heard" | "watched" | "skipped";

/**
 * 语义段落：双语讲解的最小对齐单位。
 * 同一 id 在两种语言间共享，但各语言有独立时间轴。
 * en 为 null 表示该段没有译文，按回退规则使用原声。
 */
export type Segment = {
  id: string;
  zh: string;
  en: string | null;
  /** 该段落对应的画面焦点说明（无障碍高亮） */
  highlight: string;
};

export type Artwork = {
  id: string;
  title: string;
  en: string;
  artist: string;
  year: string;
  medium: string;
  color: string;
  position: Point;
  facing: number;
  description: string;
  /** 语义段落（替代旧的按秒数切分 transcript） */
  segments: Segment[];
};

export type Route = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
};

/** 段落级收听记录，按 作品id -> 段落id 持久化 */
export type SegmentRecords = Record<string, Record<string, SegmentOutcome>>;

export type Visit = { id: string; seconds: number; at: number };

export type GalleryDocument = {
  favorites: string[];
  visits: Visit[];
  notes: Record<string, string>;
  /** 段落级收听记录 */
  segments: SegmentRecords;
};

export type TourPhase = "idle" | "walking" | "listening" | "paused" | "done";

export type TourState = {
  routeId: string | null;
  step: number;
  phase: TourPhase;
  /** 每个站的真实结局；手动跳过不会记成完整收听 */
  stopOutcomes: SegmentOutcome[];
};

/** 某条语言轨道上一个段落的裁定结果 */
export type TrackMode = "dub" | "fallback-audio" | "caption-only";

/** 语音包下载状态（zh 原声视为本地始终就绪） */
export type VoicePackStatus = "ready" | "downloading" | "error";

export type AudioState = {
  artworkId: string | null;
  lang: Lang;
  /** 当前语义段落索引 */
  segmentIndex: number;
  /** 当前段落内已播放秒数（按该语言自身时间轴） */
  segElapsed: number;
  playing: boolean;
  rate: number;
};

export type Command =
  | { type: "focus"; id: string }
  | { type: "favorite"; id: string };
