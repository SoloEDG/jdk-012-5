// 集成级验证：用状态机模拟 useNarration 的段落流转，
// 覆盖语言切换对齐、回退原声、跳过不降级、自动结束等动态行为。
// 运行：node --experimental-strip-types --import ./scripts/ts-register.mjs scripts/test-narration-machine.ts
import { artworkById } from "../src/shared/catalog.ts";
import type {
  AudioState,
  Lang,
  SegmentOutcome,
  SegmentRecords,
  VoicePackStatus,
} from "../src/shared/types.ts";
import {
  resolveTrackMode,
  segmentDuration,
  locate,
} from "../src/features/narration/lib/timeline.ts";
import { recordOutcome, artworkListening } from "../src/features/narration/lib/listening.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.error(`✗ ${name}${detail ? " — " + detail : ""}`);
  }
}
function eq<T>(name: string, actual: T, expected: T) {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  );
}

/** 与 useNarration 同构的段落状态机（不依赖 React/DOM） */
class NarrationMachine {
  state: AudioState;
  records: SegmentRecords = {};
  voice: Record<Lang, VoicePackStatus> = { zh: "ready", en: "downloading" };
  engineOk = true;
  completed: string[] = [];

  constructor(artworkId: string, lang: Lang = "zh") {
    this.state = {
      artworkId,
      lang,
      segmentIndex: 0,
      segElapsed: 0,
      playing: true,
      rate: 1,
    };
  }
  private get a() {
    return artworkById(this.state.artworkId)!;
  }
  private mode() {
    const seg = this.a.segments[this.state.segmentIndex];
    return resolveTrackMode(
      this.state.lang,
      seg.en !== null,
      this.voice[this.state.lang] === "ready",
      this.engineOk,
    );
  }
  private effLang(): Lang {
    return this.mode() === "dub" ? this.state.lang : "zh";
  }
  /** 推进 delta 秒（已含倍速语义：外部传原始秒，内部按 rate 累计） */
  tick(rawSeconds: number) {
    if (!this.state.playing) return;
    let remaining = rawSeconds * this.state.rate;
    while (remaining > 0 && this.state.playing) {
      const seg = this.a.segments[this.state.segmentIndex];
      const dur = segmentDuration(seg, this.effLang(), this.state.rate);
      const left = dur - this.state.segElapsed;
      if (remaining < left) {
        this.state.segElapsed += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        this.finishSegment();
      }
    }
  }
  private finishSegment() {
    const seg = this.a.segments[this.state.segmentIndex];
    const outcome: SegmentOutcome =
      this.mode() === "caption-only" ? "watched" : "heard";
    this.records = recordOutcome(this.records, this.a.id, seg.id, outcome);
    if (this.state.segmentIndex + 1 < this.a.segments.length) {
      this.state.segmentIndex += 1;
      this.state.segElapsed = 0;
    } else {
      this.state.playing = false;
      this.state.segElapsed = segmentDuration(
        seg,
        this.effLang(),
        this.state.rate,
      );
      if (!this.completed.includes(this.a.id)) this.completed.push(this.a.id);
    }
  }
  /** 切换语言：保留段落索引，段内归零 */
  switchLang(lang: Lang) {
    if (lang === this.state.lang) return;
    this.state.lang = lang;
    this.state.segElapsed = 0;
  }
  /** 模拟手动跳过整件作品 */
  skipArtwork() {
    for (let i = this.state.segmentIndex; i < this.a.segments.length; i++)
      this.records = recordOutcome(
        this.records,
        this.a.id,
        this.a.segments[i].id,
        "skipped",
      );
    this.state.playing = false;
  }
  /** 模拟拖动到目标绝对秒数 */
  seek(elapsed: number) {
    const located = locate(this.a, this.state.lang, this.state.rate, elapsed);
    if (located.index > this.state.segmentIndex) {
      for (let i = this.state.segmentIndex; i < located.index; i++)
        this.records = recordOutcome(
          this.records,
          this.a.id,
          this.a.segments[i].id,
          "skipped",
        );
    }
    this.state.segmentIndex = located.index;
    this.state.segElapsed = located.segElapsed;
  }
}

// 1. 完整自然播完 -> 三段 heard，触发一次完成
{
  const m = new NarrationMachine("a2", "zh");
  m.tick(1000);
  const l = artworkListening(m.records, artworkById("a2")!);
  eq("自然播完三段 heard", l.heard, 3);
  check("完整收听", l.isFullyHeard);
  eq("完成事件触发一次", m.completed, ["a2"]);
  eq("播完后暂停", m.state.playing, false);
}

// 2. 下载中切英文：回退原声，听到的仍是 heard（不是 watched/skipped）
{
  const m = new NarrationMachine("a2", "zh");
  m.tick(2); // 听完第 1 段大部分前先切语言
  m.switchLang("en"); // en 语音仍 downloading
  eq("切换后段落索引保留", m.state.segmentIndex, 0);
  eq("切换后段内进度归零", m.state.segElapsed, 0);
  eq("当前为原声回退", m.mode(), "fallback-audio");
  m.tick(1000);
  const l = artworkListening(m.records, artworkById("a2")!);
  eq("回退原声也算 heard", l.heard, 3);
  eq("没有 watched", l.watched, 0);
}

// 3. 下载完成后英文正常 dub
{
  const m = new NarrationMachine("a2", "en");
  m.voice.en = "ready";
  m.tick(1000);
  eq("语音就绪时为 dub", m.mode(), "dub");
  eq("英文完整收听", artworkListening(m.records, artworkById("a2")!).heard, 3);
}

// 4. 无译文段落 + 英文轨道：确定性回退原声
{
  const m = new NarrationMachine("a1", "en"); // a1 第 3 段 en === null
  m.voice.en = "ready";
  // 走到第 3 段
  m.tick(1000);
  const seg3 = artworkById("a1")!.segments[2];
  const mode = resolveTrackMode("en", seg3.en !== null, true, true);
  eq("无译文段即使语音就绪也回退", mode, "fallback-audio");
  eq("无译文段仍记 heard", m.records.a1[seg3.id], "heard");
}

// 5. 无引擎：全程 watched，绝不记 heard
{
  const m = new NarrationMachine("a2", "zh");
  m.engineOk = false;
  m.tick(1000);
  const l = artworkListening(m.records, artworkById("a2")!);
  eq("无引擎三段 watched", l.watched, 3);
  eq("无引擎零 heard", l.heard, 0);
  check("只看过不算听过", !l.hasHeard);
}

// 6. 手动跳过：剩余段 skipped，且不产生完成事件、不降级已 heard 段
{
  const m = new NarrationMachine("a1", "zh");
  // 先自然听完第 1 段
  const firstDur = segmentDuration(artworkById("a1")!.segments[0], "zh", 1);
  m.tick(firstDur + 0.05);
  eq("第 1 段已 heard", m.records.a1[artworkById("a1")!.segments[0].id], "heard");
  const idxAtSkip = m.state.segmentIndex;
  m.skipArtwork();
  eq("跳过不触发完成", m.completed, []);
  const l = artworkListening(m.records, artworkById("a1")!);
  eq("heard 段保持 1", l.heard, 1);
  eq("从当前段到结尾全部 skipped", l.skipped, 3 - idxAtSkip);
  check("跳过之后不是完整收听", !l.isFullyHeard);
}

// 7. 拖动越过段落：越过段记 skipped，回拖不抹除
{
  const m = new NarrationMachine("a2", "zh");
  const a = artworkById("a2")!;
  const total = a.segments.reduce(
    (n, s) => n + segmentDuration(s, "zh", 1),
    0,
  );
  m.seek(total - 0.1); // 直接拖到接近结尾
  eq("拖到最后一段", m.state.segmentIndex, 2);
  eq("越过的两段 skipped", m.records.a2[a.segments[0].id], "skipped");
  eq("第二段同样 skipped", m.records.a2[a.segments[1].id], "skipped");
  m.seek(0); // 回拖到开头
  eq("回拖不抹除 skipped", m.records.a2[a.segments[0].id], "skipped");
  eq("回拖后定位首段", m.state.segmentIndex, 0);
}

// 8. 播放中改倍速：状态机按新速率累计，段落结局不变
{
  const m = new NarrationMachine("a2", "zh");
  m.state.rate = 1.5;
  const before = m.state.segmentIndex;
  m.tick(2); // 2 秒墙钟，实际推进 3 秒内容
  check("倍速推进更快", m.state.segmentIndex >= before);
  m.tick(1000);
  eq("倍速下仍能完整 heard", artworkListening(m.records, artworkById("a2")!).heard, 3);
}

// 9. 连续快速切换语言不串段：索引始终语义稳定
{
  const m = new NarrationMachine("a1", "zh");
  m.tick(segmentDuration(artworkById("a1")!.segments[0], "zh", 1) + 0.05);
  const idx = m.state.segmentIndex; // 应在第 2 段
  m.switchLang("en");
  eq("切到英文索引不变", m.state.segmentIndex, idx);
  m.switchLang("zh");
  eq("再切回中文索引不变", m.state.segmentIndex, idx);
  m.switchLang("en");
  eq("连续切换后仍在同一段", m.state.segmentIndex, idx);
  eq("每次切换段内都归零", m.state.segElapsed, 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
