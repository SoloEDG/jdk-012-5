// 纯逻辑验证：双语段落对齐、各自时间轴、回退裁定、诚实收听记录。
// 运行：node --experimental-strip-types scripts/test-narration.ts
import { artworks, artworkById } from "../src/shared/catalog.ts";
import type { Artwork, SegmentRecords } from "../src/shared/types.ts";
import {
  locate,
  resolveTrackMode,
  resolveSegmentPlayback,
  segmentDuration,
  timeline,
  totalDuration,
  trackModeBadge,
} from "../src/features/narration/lib/timeline.ts";
import {
  artworkListening,
  markRemainingSkipped,
  pendingSegmentIndexes,
  recordOutcome,
} from "../src/features/narration/lib/listening.ts";
import { tourProgress } from "../src/features/tours/lib/routeProgress.ts";
import type { TourState } from "../src/shared/types.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
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

const a1 = artworkById("a1")!;
const a4 = artworkById("a4")!;

// 1. 数据完整性：每件作品 3 段，且存在故意缺失的英文译文
check("每件作品都有 3 个语义段落", artworks.every((a) => a.segments.length === 3));
check("a1 第 3 段无英文译文", a1.segments[2].en === null);
check("a4 第 2 段无英文译文", a4.segments[1].en === null);
check("其余段落有英文译文", a1.segments[0].en !== null && a4.segments[0].en !== null);
check("每段都有画面焦点说明", artworks.every((a) => a.segments.every((s) => s.highlight.length > 0)));

// 2. 各自时间轴：两种语言独立计时，不共享秒数；英文时长随词数线性变化
{
  const zhTotal = totalDuration(a1, "zh", 1);
  const enTotal = totalDuration(a1, "en", 1);
  check("英文时间轴与中文不同", enTotal !== zhTotal, `zh=${zhTotal.toFixed(1)} en=${enTotal.toFixed(1)}`);
  const a2 = artworkById("a2")!;
  const longSeg = a2.segments[1]; // 英文 17 词
  const shortSeg = a2.segments[0]; // 英文 5 词
  check(
    "英文时长随词数增长",
    segmentDuration(longSeg, "en", 1) > segmentDuration(shortSeg, "en", 1),
  );
  // 同一文本在不同语言下时长必然独立计算
  check(
    "同段中英时长不同（独立时间轴）",
    segmentDuration(a1.segments[0], "zh", 1) !==
      segmentDuration(a1.segments[0], "en", 1),
  );
}

// 3. 倍速只缩放时长，不改变段落数量
{
  const base = timeline(a1, "zh", 1);
  const fast = timeline(a1, "zh", 1.5);
  eq("倍速下段数不变", fast.length, base.length);
  check("1.5x 时长约为 1x 的 2/3", Math.abs(fast[0] - base[0] / 1.5) < 1e-9);
}

// 4. 绝对秒数 -> 段落定位
{
  const durations = timeline(a1, "zh", 1);
  const inFirst = locate(a1, "zh", 1, durations[0] * 0.3);
  eq("落在第 1 段", inFirst.index, 0);
  check("第 1 段内秒数正确", Math.abs(inFirst.segElapsed - durations[0] * 0.3) < 1e-9);
  const inSecond = locate(a1, "zh", 1, durations[0] + 0.2);
  eq("越过首段边界后落在第 2 段", inSecond.index, 1);
  const end = locate(a1, "zh", 1, totalDuration(a1, "zh", 1) + 99);
  eq("超出总时长标记 finished", end.finished, true);
  eq("超出时定位到最后一段", end.index, 2);
}

// 5. 回退裁定规则
// 引擎可用
eq("中文原声始终 dub", resolveTrackMode("zh", true, true, true), "dub");
eq("英文有译文且语音就绪 -> dub", resolveTrackMode("en", true, true, true), "dub");
eq(
  "英文有译文但语音下载中 -> 原声回退",
  resolveTrackMode("en", true, false, true),
  "fallback-audio",
);
eq(
  "英文译文缺失 -> 原声回退",
  resolveTrackMode("en", false, true, true),
  "fallback-audio",
);
eq("无语音引擎 -> 仅字幕", resolveTrackMode("en", true, true, false), "caption-only");
eq("中文下无引擎仍是仅字幕", resolveTrackMode("zh", true, true, false), "caption-only");

// 6. 段落实际播报文稿与字幕语言
{
  const noTrans = a1.segments[2]; // en === null
  const fb = resolveSegmentPlayback(noTrans, "en", "fallback-audio");
  eq("无译文回退时念中文原声", fb.speakLang, "zh");
  eq("无译文回退时字幕也是中文", fb.captionLang, "zh");
  eq("回退语音文本为中文原文", fb.speakText, noTrans.zh);

  const trans = a1.segments[0];
  const downloading = resolveSegmentPlayback(trans, "en", "fallback-audio");
  eq("译制下载中：念原声", downloading.speakLang, "zh");
  eq("译制下载中：字幕仍为英文", downloading.captionLang, "en");
  eq("下载中字幕显示英文译文", downloading.captionText, trans.en);

  const dub = resolveSegmentPlayback(trans, "en", "dub");
  eq("正常译制：念英文", dub.speakLang, "en");
  eq("正常译制：英文字幕", dub.captionLang, "en");

  const co = resolveSegmentPlayback(trans, "en", "caption-only");
  eq("仅字幕模式字幕为英文", co.captionLang, "en");
}

// 7. 诚实收听记录：heard 不被 skipped 降级
{
  let rec: SegmentRecords = {};
  rec = recordOutcome(rec, "a1", a1.segments[0].id, "heard");
  rec = recordOutcome(rec, "a1", a1.segments[0].id, "skipped");
  eq("heard 不被 skipped 覆盖", rec.a1[a1.segments[0].id], "heard");
  rec = recordOutcome(rec, "a1", a1.segments[1].id, "watched");
  rec = recordOutcome(rec, "a1", a1.segments[1].id, "heard");
  eq("watched 可升级为 heard", rec.a1[a1.segments[1].id], "heard");
  rec = recordOutcome(rec, "a1", a1.segments[2].id, "skipped");
  const l = artworkListening(rec, a1);
  eq("听过段数", l.heard, 2);
  eq("跳过段数", l.skipped, 1);
  check("至少听过一段 -> hasHeard", l.hasHeard);
  check("未全部 heard -> 非完整收听", !l.isFullyHeard);
  check("三段都有结局 -> isComplete", l.isComplete);
}

// 8. 只看过：watched 不计 heard
{
  let rec: SegmentRecords = {};
  rec = recordOutcome(rec, "a2", artworkById("a2")!.segments[0].id, "watched");
  const l = artworkListening(rec, artworkById("a2")!);
  check("仅 watched 时 hasHeard=false", !l.hasHeard);
  eq("watched 计数为 1", l.watched, 1);
  check("未完成", !l.isComplete);
}

// 9. markRemainingSkipped 不碰已完成段落
{
  let rec: SegmentRecords = {};
  rec = recordOutcome(rec, "a1", a1.segments[0].id, "heard");
  rec = markRemainingSkipped(rec, a1, 1);
  const l = artworkListening(rec, a1);
  eq("首段保持 heard", l.heard, 1);
  eq("后两段被跳过", l.skipped, 2);
  eq("待完成段落为空", pendingSegmentIndexes(rec, a1), []);
}

// 10. 待完成段落（恢复参观用）
{
  let rec: SegmentRecords = {};
  rec = recordOutcome(rec, "a1", a1.segments[0].id, "heard");
  eq("剩余两段未完成", pendingSegmentIndexes(rec, a1), [1, 2]);
}

// 11. 语言切换的语义对齐：同一索引、各自时间轴独立
{
  const zhDurations = timeline(a1, "zh", 1);
  const enDurations = timeline(a1, "en", 1);
  // 模拟在中文第 2 段中途切到英文：索引保持 1，英文从该段开头重念
  const idx = 1;
  const zhPoint = zhDurations[0] + zhDurations[1] * 0.5;
  const located = locate(a1, "zh", 1, zhPoint);
  eq("切换前位于第 2 段", located.index, idx);
  const enRestart = locate(a1, "en", 1, enDurations[0]); // 英文从段首开始
  eq("切换后仍对齐第 2 段", enRestart.index, idx);
  eq("切换后段内进度归零", enRestart.segElapsed, 0);
}

// 12. 导览进度：跳过不计入完成
{
  const base: TourState = {
    routeId: "nature",
    step: 3,
    phase: "done",
    stopOutcomes: ["heard", "skipped", "watched"],
  };
  const p = tourProgress(base);
  check("2/3 站真实消费，跳过不计", Math.abs(p - 2 / 3) < 1e-9, `got ${p}`);
  const allSkip: TourState = { ...base, stopOutcomes: ["skipped", "skipped", "skipped"] };
  eq("全部跳过时进度为 0", tourProgress(allSkip), 0);
}

// 13. 跨作品记录互不污染
{
  let rec: SegmentRecords = {};
  rec = recordOutcome(rec, "a1", a1.segments[0].id, "heard");
  rec = recordOutcome(rec, "a2", artworkById("a2")!.segments[0].id, "skipped");
  eq("a1 独立计数", artworkListening(rec, a1).heard, 1);
  eq("a2 独立计数", artworkListening(rec, artworkById("a2")!).skipped, 1);
}

// 14. 回退徽标文案：原因必须明确可区分
{
  eq("正常译制无徽标", trackModeBadge("dub", "en", true, false), null);
  eq(
    "译文缺失徽标",
    trackModeBadge("fallback-audio", "en", false, false),
    "原声 · 本段无译文",
  );
  eq(
    "译制下载中徽标",
    trackModeBadge("fallback-audio", "en", true, false),
    "原声 · 译制语音下载中",
  );
  eq(
    "无引擎仅字幕徽标",
    trackModeBadge("caption-only", "en", true, false),
    "仅字幕（无音频）",
  );
  eq(
    "语音报错徽标",
    trackModeBadge("caption-only", "en", true, true),
    "仅字幕 · 语音不可用",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
