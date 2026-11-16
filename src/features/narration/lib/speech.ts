import { useEffect, useState } from "react";
import type { Lang, VoicePackStatus } from "../../../shared/types";

/**
 * 语音包下载状态。
 * zh 原声视为本地内置、始终就绪；en 译制语音模拟一次较慢的下载，
 * 用于验证“下载未完成时回退原声”的规则。
 */
const status: Record<Lang, VoicePackStatus> = {
  zh: "ready",
  en: "downloading",
};
const listeners = new Set<() => void>();
const EN_DOWNLOAD_MS = 2800;
let enTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function scheduleEnDownload(delay = EN_DOWNLOAD_MS) {
  status.en = "downloading";
  if (enTimer) clearTimeout(enTimer);
  enTimer = setTimeout(() => {
    // 下载完成：仅在确实存在语音引擎时才算就绪，否则标记失败
    status.en = engineSupported() ? "ready" : "error";
    enTimer = null;
    emit();
  }, delay);
}

if (typeof window !== "undefined") scheduleEnDownload();

export function engineSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getVoicePack(lang: Lang): VoicePackStatus {
  return status[lang];
}

/** 失败后重新下载 */
export function retryVoicePack(lang: Lang) {
  if (lang === "en" && status.en !== "ready") scheduleEnDownload(1500);
}

export function useVoicePacks(): Record<Lang, VoicePackStatus> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { zh: status.zh, en: status.en };
}

/** 单调递增的会话令牌：任何过期回调都必须先核对令牌 */
let sessionToken = 0;

export type SpeakRequest = {
  text: string;
  lang: Lang;
  rate: number;
  onStart?: () => void;
  onEnd?: (started: boolean) => void;
  onError?: () => void;
};

export type SpeakHandle = { token: number; cancel: () => void };

export function stopSpeech() {
  sessionToken++;
  if (engineSupported()) window.speechSynthesis.cancel();
}

/**
 * 播报一个段落。返回是否真的启动了语音。
 * started 标志区分“真的听到”与“只有字幕”，是诚实收听记录的依据。
 */
export function speakSegment(req: SpeakRequest): SpeakHandle & { ok: boolean } {
  const token = ++sessionToken;
  if (!engineSupported()) {
    // 无引擎：异步回调仍按会话约定触发，上层记为 watched
    queueMicrotask(() => {
      if (token === sessionToken) req.onEnd?.(false);
    });
    return { token, ok: false, cancel: () => void 0 };
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(req.text);
  u.lang = req.lang === "en" ? "en-US" : "zh-CN";
  u.rate = req.rate;
  let started = false;
  u.onstart = () => {
    started = true;
    if (token === sessionToken) req.onStart?.();
  };
  u.onend = () => {
    if (token === sessionToken) req.onEnd?.(started);
  };
  u.onerror = () => {
    if (token === sessionToken) req.onError?.();
  };
  window.speechSynthesis.speak(u);
  return {
    token,
    ok: true,
    cancel: () => {
      if (token === sessionToken) {
        sessionToken++;
        window.speechSynthesis.cancel();
      }
    },
  };
}
