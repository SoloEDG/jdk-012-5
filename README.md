# 余境 · 虚拟艺术馆

安装：`npm ci`

本地启动：`npm run dev`

类型检查：`npm run typecheck`

逻辑与状态机测试：`npm run test:logic`（88 项断言，无需浏览器）

生产构建：`npm run build`

Docker 启动：`docker compose up --build`，访问 http://localhost:18112 。

## 双语无障碍讲解轨道

讲解以**语义段落**为最小对齐单位，详见 [`docs/bilingual-narration-design.md`](docs/bilingual-narration-design.md)。

- 中文原声与英文译制共享段落 id，但各自拥有独立时间轴，切换语言保留当前段落、段内归零，不重复已结束内容。
- 译文缺失或英文语音包下载期间，按确定性规则回退原声并显示徽标；设备无语音时仅展示字幕。
- 段落结局分 `heard`（听过）/ `watched`（只看过）/ `skipped`（已跳过），手动跳过与拖动越过不伪装成收听。
- 主题导览仅在讲解自然播完后自动进入下一站，进度只计真实消费的站点。
- 播放快照持久化，重新打开可恢复到对应作品、语言与段落（恢复后保持暂停）。
- 当前讲解作品在 3D 画面中高亮脉冲，字幕区同步展示该段画面焦点。
