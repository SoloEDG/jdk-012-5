import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Artwork,
  AudioState,
  Lang,
  SegmentOutcome,
  TrackMode,
  VoicePackStatus,
} from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import {
  locate,
  resolveSegmentPlayback,
  resolveTrackMode,
  segmentDuration,
  totalDuration,
} from "../lib/timeline";
import {
  SpeakHandle,
  engineSupported,
  getVoicePack,
  speakSegment,
  stopSpeech,
  useVoicePacks,
} from "../lib/speech";

const initialAudio: AudioState = {
  artworkId: null,
  lang: "zh",
  segmentIndex: 0,
  segElapsed: 0,
  playing: false,
  rate: 1,
};

export type NarrationParams = {
  onComplete?: (artworkId: string) => void;
  onOutcome?: (
    artworkId: string,
    segmentId: string,
    outcome: SegmentOutcome,
  ) => void;
  onSnapshot?: (s: {
    artworkId: string;
    lang: Lang;
    segmentIndex: number;
    rate: number;
  }) => void;
};

/** 非响应式读取语音包状态，供时钟/回调使用，避免闭包旧值 */
function voiceStatus(lang: Lang): VoicePackStatus {
  return getVoicePack(lang);
}

/** 当前语言时间轴上的绝对秒数（进度条用） */
function timelineElapsed(
  a: Artwork,
  lang: Lang,
  rate: number,
  index: number,
  segElapsed: number,
): number {
  let acc = 0;
  for (let i = 0; i < index; i++)
    acc += segmentDuration(a.segments[i], lang, rate);
  const current = segmentDuration(a.segments[index], lang, rate);
  return acc + Math.min(segElapsed, current);
}

export function useNarration(params: NarrationParams = {}) {
  const [state, setState] = useState<AudioState>(initialAudio);
  const voicePacks = useVoicePacks();
  const [voiceError, setVoiceError] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const speakRef = useRef<SpeakHandle | null>(null);
  /** 防止 onend 与时钟兜底重复推进同一段 */
  const advancingRef = useRef(false);
  /** 已自然播完或已跳过的作品，防止 onComplete 重复触发 */
  const finishedRef = useRef<string | null>(null);

  const artwork: Artwork | undefined = artworkById(state.artworkId);
  const engineOk = engineSupported();
  const segment = artwork ? artwork.segments[state.segmentIndex] : undefined;

  const mode: TrackMode | null = useMemo(() => {
    if (!artwork || !segment) return null;
    return resolveTrackMode(
      state.lang,
      segment.en !== null,
      voicePacks[state.lang] === "ready",
      engineOk,
    );
  }, [artwork, segment, state.lang, voicePacks, engineOk]);

  const playback = useMemo(() => {
    if (!segment || !mode) return null;
    return resolveSegmentPlayback(segment, state.lang, mode);
  }, [segment, state.lang, mode]);

  const persist = useCallback((next: AudioState) => {
    if (next.artworkId)
      paramsRef.current.onSnapshot?.({
        artworkId: next.artworkId,
        lang: next.lang,
        segmentIndex: next.segmentIndex,
        rate: next.rate,
      });
  }, []);

  /** 推进到下一段或结束整件作品；advancingRef 保证幂等 */
  const advance = useCallback(() => {
    const s = stateRef.current;
    const a = artworkById(s.artworkId);
    if (!a || advancingRef.current) return;
    advancingRef.current = true;
    const current = a.segments[s.segmentIndex];
    const currentMode = resolveTrackMode(
      s.lang,
      current.en !== null,
      voiceStatus(s.lang) === "ready",
      engineSupported(),
    );
    const outcome: SegmentOutcome =
      currentMode === "caption-only" ? "watched" : "heard";
    paramsRef.current.onOutcome?.(a.id, current.id, outcome);

    if (s.segmentIndex + 1 < a.segments.length) {
      const next: AudioState = {
        ...s,
        segmentIndex: s.segmentIndex + 1,
        segElapsed: 0,
      };
      setState(next);
      persist(next);
      queueMicrotask(() => (advancingRef.current = false));
    } else {
      setState({ ...s, playing: false });
      stopSpeech();
      if (finishedRef.current !== a.id) {
        finishedRef.current = a.id;
        paramsRef.current.onComplete?.(a.id);
      }
      queueMicrotask(() => (advancingRef.current = false));
    }
  }, [persist]);

  // 段落播报：仅在段落/语言/倍速变化或恢复播放时重新起念
  useEffect(() => {
    if (!state.playing || !artwork || !segment || !mode || !playback) {
      stopSpeech();
      speakRef.current = null;
      return;
    }
    setVoiceError(false);
    const handle = speakSegment({
      text: playback.speakText,
      lang: playback.speakLang,
      rate: state.rate,
      onEnd: (started) => {
        if (speakRef.current?.token !== handle.token) return; // 过期会话作废
        if (!started) setVoiceError(true);
        advance();
      },
      onError: () => {
        if (speakRef.current?.token !== handle.token) return;
        setVoiceError(true);
        advance();
      },
    });
    speakRef.current = handle;
    return () => handle.cancel();
  }, [
    state.playing,
    state.artworkId,
    state.segmentIndex,
    state.lang,
    state.rate,
    artwork,
    segment,
    mode,
    playback,
    advance,
  ]);

  // 时钟：驱动进度条，并在 TTS 回调缺失时兜底推进
  useEffect(() => {
    if (!state.playing || !artwork) return;
    const timer = setInterval(() => {
      setState((s) => {
        const a = artworkById(s.artworkId);
        if (!a || !s.playing) return s;
        const seg = a.segments[s.segmentIndex];
        if (!seg) return s;
        const m = resolveTrackMode(
          s.lang,
          seg.en !== null,
          voiceStatus(s.lang) === "ready",
          engineSupported(),
        );
        // 回退原声时按原声时长计时，保证字幕与语音同轨
        const effLang: Lang = m === "dub" ? s.lang : "zh";
        const dur = segmentDuration(seg, effLang, s.rate);
        const segElapsed = s.segElapsed + 0.1 * s.rate;
        if (segElapsed >= dur) {
          queueMicrotask(() => advance());
          return { ...s, segElapsed: dur };
        }
        return { ...s, segElapsed };
      });
    }, 100);
    return () => clearInterval(timer);
  }, [state.playing, artwork, advance]);

  const play = useCallback(
    (id?: string) => {
      setState((s) => {
        const targetId = id || s.artworkId;
        if (!targetId) return s;
        const a = artworkById(targetId);
        if (!a) return s;
        const restart =
          id !== undefined && (s.artworkId !== id || finishedRef.current === id);
        if (restart) finishedRef.current = null;
        const next: AudioState = {
          artworkId: targetId,
          lang: s.lang,
          segmentIndex: restart
            ? 0
            : Math.min(s.segmentIndex, a.segments.length - 1),
          segElapsed: restart ? 0 : s.segElapsed,
          playing: true,
          rate: s.rate,
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const pause = useCallback(() => {
    stopSpeech();
    setState((s) => {
      const next = { ...s, playing: false };
      persist(next);
      return next;
    });
  }, [persist]);

  const toggle = useCallback(() => {
    if (stateRef.current.playing) {
      pause();
      return;
    }
    setState((s) => ({ ...s, playing: true }));
  }, [pause]);

  /** 切换语言：保留语义段落，段落内进度归零，已结束段落不重复 */
  const switchLang = useCallback(
    (lang: Lang) => {
      setState((s) => {
        if (!s.artworkId || s.lang === lang) return s;
        stopSpeech();
        const next: AudioState = { ...s, lang, segElapsed: 0 };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 拖动：越过的未完成段落显式记跳过；向后拖不抹除记录 */
  const seek = useCallback(
    (elapsed: number) => {
      setState((s) => {
        const a = artworkById(s.artworkId);
        if (!a) return s;
        const located = locate(a, s.lang, s.rate, elapsed);
        if (located.index > s.segmentIndex) {
          for (let i = s.segmentIndex; i < located.index; i++)
            paramsRef.current.onOutcome?.(a.id, a.segments[i].id, "skipped");
        }
        stopSpeech();
        const next: AudioState = {
          ...s,
          segmentIndex: located.index,
          segElapsed: located.segElapsed,
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 播放中改倍速：立即生效，当前段以新倍速重新起念 */
  const setRate = useCallback(
    (rate: number) => {
      stopSpeech();
      setState((s) => {
        const next = { ...s, rate };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 手动跳过：剩余段落全部记 skipped，且不触发自动下一站 */
  const skipArtwork = useCallback(() => {
    const s = stateRef.current;
    const a = artworkById(s.artworkId);
    if (!a) return;
    for (let i = s.segmentIndex; i < a.segments.length; i++)
      paramsRef.current.onOutcome?.(a.id, a.segments[i].id, "skipped");
    stopSpeech();
    finishedRef.current = a.id;
    setState((x) => ({ ...x, playing: false }));
  }, []);

  /** 恢复参观：定位到快照段落，但保持暂停，由用户主动播放 */
  const resume = useCallback(
    (snapshot: {
      artworkId: string;
      lang: Lang;
      segmentIndex: number;
      rate: number;
    }) => {
      const a = artworkById(snapshot.artworkId);
      if (!a) return;
      finishedRef.current = null;
      stopSpeech();
      setState({
        artworkId: snapshot.artworkId,
        lang: snapshot.lang,
        segmentIndex: Math.min(snapshot.segmentIndex, a.segments.length - 1),
        segElapsed: 0,
        playing: false,
        rate: snapshot.rate,
      });
    },
    [],
  );

  const total = artwork
    ? totalDuration(artwork, state.lang, state.rate)
    : 0;
  const elapsed = artwork
    ? timelineElapsed(
        artwork,
        state.lang,
        state.rate,
        state.segmentIndex,
        state.segElapsed,
      )
    : 0;

  return {
    state,
    artwork,
    segment,
    mode,
    caption: playback?.captionText || "",
    captionLang: playback?.captionLang || null,
    highlight: segment?.highlight || "",
    voicePacks,
    voiceError,
    engineOk,
    elapsed,
    total,
    play,
    pause,
    toggle,
    switchLang,
    seek,
    setRate,
    skipArtwork,
    resume,
  };
}
