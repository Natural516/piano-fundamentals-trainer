# Phase D 核心训练 E2E 闭环 —— 基线记录

日期：2026-08-14
分支：`feature/standard-music-notation`

## 1. 实际 HEAD

- 起始参考提交：`0a46e34`（Phase D 指令给出）
- 当前 HEAD：`55f7a1c`（`checkpoint: wait realtime correctness`）
- 本阶段已提交的 checkpoint：
  - `32d0dc3` checkpoint: score time model v2
  - `32aa444` checkpoint: standards compliant mxl
  - `2e30da6` checkpoint: score practice real segment
  - `55f7a1c` checkpoint: wait realtime correctness

## 2. 未提交工作区（基线时点）

继续开发时工作区含以下未提交文件：

- 修改：`scripts/regression-check.cjs`、`scripts/score-fixtures/e2e-core-loop.xml`
- 修改：`src/renderer/src/ability/abilityModel.ts`、`src/renderer/src/plan/planner.ts`、`src/renderer/src/playback/playback.ts`、`src/renderer/src/storage/backup.ts`、`src/renderer/src/utils/practiceRecordStorage.ts`、`src/renderer/src/components/ScorePracticePage.tsx`
- 新增：`src/renderer/src/ability/scoreMastery.ts`、`src/renderer/src/records/practiceRecordRepository.ts`

禁止 `git reset --hard` / `git restore .`；基线记录不代表允许回滚。

## 3. 回归基线

基线时点 `npm run test:regression`：

- 原有 121 项全部通过；
- 新增 E2E 核心闭环测试后共 122 项，E2E 测试当时仍失败（失败点随修复推进：能力模型读不到 `score` 记录 → Planner 不出小节任务 → Coach 空记录不返回示范 → scheduler 在 Node 无 `window` → stop 重复 All Notes Off → 趋势方向颠倒）。

## 4. typecheck / build 基线

- `npm run typecheck`：通过
- `npm run build`：通过

## 5. 已知 PARTIAL（基线时点）

以下模块在基线时点仍是“纯函数/引擎已通，产品接线未完成”：

- `TrainingPlanPage` 仍读取旧 `DAILY_TRAINING_PLAN` 常量，未真实使用 Planner 2.0
- Score Practice 页没有 AI 输入框/发送，示范按钮由页面当前控件生成，而非 AI `demoRequests`
- 正式主练习视图仍是“目标音 + MiniKeyboard”，没有多小节大谱表
- `saveSegment` 是空函数
- Tier B（MusicXML + MIDI 双文件）只有文字，没有交叉验证
- 备份清单缺少曲谱导入仓库；每日计划 V2 键已列入但页面未持久化
- `docs/agent/e2e-core-loop/baseline.md` 尚未创建

## 6. 本指令已知 Bug 复现情况（基线时点）

| Bug | 复现 | 说明 |
| --- | --- | --- |
| divisions 中途变更时长错误 | 已复现并修复 | ScoreTime V2 canonical PPQ 480 |
| backup/forward 近似 | 已修复 | 每 part 单一 document cursor |
| tie stop+start 链 | 已修复 | `tieStart/tieStop` + `mergeTiedPerformanceEvents()` |
| segment 不 rebase | 已修复 | `buildPracticeSegment()` 统一选区工具 |
| score-timewise 假支持 | 已修复 | 明确抛 `UnsupportedScoreFormatError` |
| MXL 非标准 deflate | 已修复 | 标准 method 8 raw DEFLATE + container.xml rootfile |
| measure 筛选靠解析 unit.id | 已修复 | Playback 事件直接携带 measure/beat/tick |
| stop 后挂音 | 已修复 | 单一生命周期 scheduler，stop 清定时器 + All Notes Off + sustain off |
| AI DemoRequest 未驱动播放 | 修复中 | Coach 已返回 demoRequests，页面接线在本轮完成 |
| TrainingPlanPage 未接 Planner 2.0 | 未开始 | 本轮完成 |

## 7. 诚实状态

基线时点不宣称 `CORE TRAINING E2E LOOP COMPLETE`。只有 E2E 全绿且上述产品主线真实接线完成后才可宣称完成；否则报告为 `CORE TRAINING E2E LOOP PARTIAL`。
