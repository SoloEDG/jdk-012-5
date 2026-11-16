import type { Artwork, Lang, Segment, TrackMode } from "../../../shared/types";

/**
 * 每种语言拥有独立时间轴：
 * - 中文按字数估算（含标点约 4.2 字/秒的自然语速）
 * - 英文按词数估算（约 2.4 词/秒）
 * 再加上固定的段落停顿。倍速在外层相除，不写进基础时长。
 */
const BASE_PAUSE = 0.7;

export function segmentBaseDuration(seg: Segment, lang: Lang): number {
  if (lang === "zh") {
    const chars = Array.from(seg.zh).filter((c) => c.trim().length > 0).length;
    return chars / 4.2 + BASE_PAUSE;
  }
  // 无译文的段落不会真正以 en 时间轴播放（回退为原声），给一个保底值
  const words = seg.en ? seg.en.split(/\s+/).filter(Boolean).length : 0;
  return words / 2.4 + BASE_PAUSE;
}

export function segmentDuration(seg: Segment, lang: Lang, rate: number): number {
  return segmentBaseDuration(seg, lang) / Math.max(0.1, rate);
}

/** 该语言下作品的完整时间轴（秒），逐段累计 */
export function timeline(a: Artwork, lang: Lang, rate: number): number[] {
  return a.segments.map((s) => segmentDuration(s, lang, rate));
}

export function totalDuration(a: Artwork, lang: Lang, rate: number): number {
  return timeline(a, lang, rate).reduce((n, d) => n + d, 0);
}

/** 把某语言时间轴上的绝对秒数换算为段落索引与段落内秒数 */
export function locate(
  a: Artwork,
  lang: Lang,
  rate: number,
  elapsed: number,
): { index: number; segElapsed: number; finished: boolean } {
  const durations = timeline(a, lang, rate);
  let rest = Math.max(0, elapsed);
  for (let i = 0; i < durations.length; i++) {
    if (rest < durations[i])
      return { index: i, segElapsed: rest, finished: false };
    rest -= durations[i];
  }
  return {
    index: durations.length - 1,
    segElapsed: durations[durations.length - 1] || 0,
    finished: true,
  };
}

/** 段落起点在该语言时间轴上的绝对秒数（供进度条与拖动使用） */
export function segmentOffsets(
  a: Artwork,
  lang: Lang,
  rate: number,
): number[] {
  const durations = timeline(a, lang, rate);
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) {
    offsets.push(acc);
    acc += d;
  }
  return offsets;
}

/**
 * 段落级回退裁定（设计文档第 3 节）。
 * @param translated 该段是否存在目标语言译文
 * @param voiceReady 目标语言语音包是否就绪（zh 恒为 true）
 * @param engineOk   设备是否有任何可用语音引擎
 */
export function resolveTrackMode(
  lang: Lang,
  translated: boolean,
  voiceReady: boolean,
  engineOk: boolean,
): TrackMode {
  if (!engineOk) return "caption-only";
  if (lang === "zh") return "dub";
  if (translated && voiceReady) return "dub";
  // 译文缺失或译制语音未就绪：确定性回退到原声
  return "fallback-audio";
}

/** 实际应该念出来的文本与字幕语言（回退时语音用原声，字幕按规则选择） */
export function resolveSegmentPlayback(
  seg: Segment,
  lang: Lang,
  mode: TrackMode,
): { speakText: string; speakLang: Lang; captionText: string; captionLang: Lang } {
  const useOriginalVoice = mode !== "dub";
  const speakLang: Lang = useOriginalVoice ? "zh" : lang;
  const speakText = useOriginalVoice ? seg.zh : seg.en ?? seg.zh;
  // 译文缺失时字幕也只能给原声；译制语音下载中时仍展示目标语言字幕
  const captionLang: Lang = lang === "en" && seg.en === null ? "zh" : lang;
  const captionText = captionLang === "en" ? seg.en ?? seg.zh : seg.zh;
  return { speakText, speakLang, captionText, captionLang };
}

/** 播放器徽标文案：明确告知用户当前段为何回退 */
export function trackModeBadge(
  mode: TrackMode,
  lang: Lang,
  translated: boolean,
  voiceError: boolean,
): string | null {
  if (mode === "dub") return null;
  if (mode === "caption-only")
    return voiceError ? "仅字幕 · 语音不可用" : "仅字幕（无音频）";
  // fallback-audio
  if (lang === "en" && !translated) return "原声 · 本段无译文";
  return "原声 · 译制语音下载中";
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}
