import { Play, Pause, Headphones, SkipForward, Languages } from "lucide-react";
import type { Lang, SegmentOutcome, TrackMode, VoicePackStatus } from "../../../shared/types";
import { formatTime, trackModeBadge } from "../lib/timeline";
import { outcomeLabel } from "../lib/listening";

type NarrationLike = {
  state: {
    artworkId: string | null;
    lang: Lang;
    segmentIndex: number;
    playing: boolean;
    rate: number;
  };
  artwork: { title: string; segments: { id: string }[] } | undefined;
  segment: { id: string; highlight: string; en: string | null } | undefined;
  mode: TrackMode | null;
  caption: string;
  captionLang: Lang | null;
  highlight: string;
  voicePacks: Record<Lang, VoicePackStatus>;
  voiceError: boolean;
  engineOk: boolean;
  elapsed: number;
  total: number;
};

export function AudioPlayer({
  narration,
  records,
  onToggle,
  onSeek,
  onRate,
  onLang,
  onSkip,
  onRetryVoice,
}: {
  narration: NarrationLike;
  records: Record<string, SegmentOutcome> | undefined;
  onToggle: () => void;
  onSeek: (n: number) => void;
  onRate: (n: number) => void;
  onLang: (l: Lang) => void;
  onSkip: () => void;
  onRetryVoice: () => void;
}) {
  const { state, artwork, segment, mode } = narration;
  const badge = mode
    ? trackModeBadge(mode, state.lang, segment?.en !== null && segment?.en !== undefined, narration.voiceError)
    : null;
  return (
    <div className="audio-player" role="region" aria-label="双语讲解播放器">
      <div className="audio-icon">
        <Headphones size={20} />
      </div>
      <div className="audio-title">
        <small>双语无障碍讲解 · AUDIO GUIDE</small>
        <strong>{artwork?.title || "让艺术，有声可循"}</strong>
      </div>

      <div
        className="lang-switch"
        role="group"
        aria-label="讲解语言，切换后保留当前段落"
      >
        <Languages size={14} aria-hidden />
        <button
          className={state.lang === "zh" ? "lang active" : "lang"}
          aria-pressed={state.lang === "zh"}
          onClick={() => onLang("zh")}
        >
          原声 中
        </button>
        <button
          className={state.lang === "en" ? "lang active" : "lang"}
          aria-pressed={state.lang === "en"}
          onClick={() => onLang("en")}
        >
          EN
        </button>
      </div>

      <button
        aria-label={state.playing ? "暂停讲解" : "播放讲解"}
        className="play-button"
        onClick={onToggle}
        disabled={!artwork}
      >
        {state.playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <span className="time">{formatTime(narration.elapsed)}</span>
      <input
        aria-label="讲解进度（按语义段落）"
        type="range"
        min="0"
        max={narration.total || 1}
        step=".1"
        value={Math.min(narration.elapsed, narration.total || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={!artwork}
      />
      <span className="time">{formatTime(narration.total)}</span>
      <select
        aria-label="讲解速度"
        value={state.rate}
        onChange={(e) => onRate(Number(e.target.value))}
      >
        <option value="0.8">0.8×</option>
        <option value="1">1.0×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
      </select>
      <button
        className="skip-button"
        onClick={onSkip}
        disabled={!artwork}
        aria-label="跳过当前作品，未听段落记为已跳过"
      >
        <SkipForward size={15} /> 跳过
      </button>

      {artwork && (
        <div className="segment-track" aria-label="语义段落进度">
          {artwork.segments.map((s, i) => {
            const outcome = records?.[s.id];
            const isCurrent = segment?.id === s.id;
            return (
              <span
                key={s.id}
                className={
                  "seg-dot seg-" + (outcome || "pending") + (isCurrent ? " current" : "")
                }
                title={`第 ${i + 1} 段 · ${outcomeLabel(outcome)}`}
                aria-label={`第 ${i + 1} 段，${outcomeLabel(outcome)}`}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
      )}

      <div className="caption" aria-live="polite">
        {!narration.engineOk ? (
          <span className="caption-badge">设备不支持语音，请阅读字幕</span>
        ) : (
          badge && (
            <button className="caption-badge" onClick={onRetryVoice}>
              {badge}
              {narration.voicePacks[state.lang] === "error" ? " · 重试" : ""}
            </button>
          )
        )}
        <p className="caption-text">
          {narration.caption || "选择一件作品，听见它背后的故事"}
        </p>
        {narration.captionLang && (
          <small className="caption-lang">
            字幕语言：{narration.captionLang === "en" ? "English" : "中文"}
          </small>
        )}
        {segment && (
          <small className="caption-highlight">
            画面焦点：{narration.highlight}
          </small>
        )}
      </div>
    </div>
  );
}
