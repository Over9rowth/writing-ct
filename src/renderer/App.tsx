// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { runWritingCT, WritingCTReport } from '../domain/writing-ct.cjs';

// 30 秒“诶”点内置科技评论样本
const SAMPLE_TEXT = `在如今生成式人工智能突飞猛进的时代背景下，我们其实在某种程度上见证了前所未有的工程狂欢。
很多人老实说并没有意识到，当一个大模型被推向生产环境时，由于底层调度系统架构日益庞杂、分布式通信链路冗长且各个并行节点之间的交互模式千差万别，传统的黑盒观测手段往往难以及时发现那些深藏在异步调用链条底层的隐蔽时序竞态问题。
换句话说，系统稳定性在这个时候就显得极其脆弱。
事实上，我们进行了全方位的链路排查。事实上，我们做出了深入的代码审计。事实上，我们加以了严密的监控覆盖。事实上，我们确认了异常的真实原因。
总而言之，技术的本质不在于堆砌参数。
某种程度上，真正的系统韧性来自于对每一个边界细节的精确敬畏，老实说这非常关键。`;

declare global {
  interface Window {
    writingct?: {
      exportReportJson: (json: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: unknown) => Promise<void>;
    };
  }
}

export function App() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [report, setReport] = useState<WritingCTReport | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    // 自动运行初始诊断
    const r = runWritingCT(text);
    setReport(r);

    if (window.writingct) {
      window.writingct.smokeReady({ mounted: true, engineOk: !!r });
      window.writingct.onSmokeRun(() => {
        const fresh = runWritingCT(SAMPLE_TEXT);
        window.writingct?.smokeResult({ report: fresh });
      });
    }
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setReport(runWritingCT(val));
  };

  const handleExportJson = async () => {
    if (!report || !window.writingct) return;
    await window.writingct.exportReportJson(JSON.stringify(report, null, 2));
  };

  const handleExportManual = async () => {
    if (!window.writingct) return;
    await window.writingct.exportManualPdf();
  };

  return (
    <div className="container">
      {/* 顶部标题栏与仪器状态 */}
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <h1 className="title">文风体检台 <span className="version">v0.1.0</span></h1>
          <span className="badge">100% 本机离线</span>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => { setText(SAMPLE_TEXT); setReport(runWritingCT(SAMPLE_TEXT)); }}>
            重载演示样本
          </button>
          <button className="btn btn-secondary" onClick={handleExportManual}>
            导出说明书 (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportJson}>
            导出体检报告 (JSON)
          </button>
        </div>
      </header>

      {/* 诚实边界常驻提示条 */}
      <div className="honest-banner">
        【仪器观测边界】本工具仅做客观统计与确定性规则显影（句长方差、高频口头禅、重复N-gram），不作主观优劣评判，不上传任何数据。
      </div>

      {/* 核心指标仪表卡片 */}
      {report && (
        <section className="dashboard-grid">
          <div className="card">
            <div className="card-label">总句数 / 有效总字数</div>
            <div className="card-value">
              {report.rhythm.totalSentences} <span className="unit">句</span> / {report.rhythm.totalChars} <span className="unit">字</span>
            </div>
            <div className="card-sub">平均句长 {report.rhythm.meanLength} 字 / 标准差 {report.rhythm.stdDevLength}</div>
          </div>

          <div className="card">
            <div className="card-label">最长长难句</div>
            <div className="card-value highlight-alert">
              {report.rhythm.maxSentence?.charCount ?? 0} <span className="unit">字</span>
            </div>
            <div className="card-sub">
              {report.rhythm.longSentenceRatio > 0
                ? `超长句(>60字)占比 ${(report.rhythm.longSentenceRatio * 100).toFixed(1)}%`
                : '暂无超长长难句'}
            </div>
          </div>

          <div className="card">
            <div className="card-label">口头禅/虚词命中</div>
            <div className="card-value highlight-amber">
              {report.petPhrases.totalHits} <span className="unit">次</span>
            </div>
            <div className="card-sub">千字率 {report.petPhrases.hitsPerThousandChars} 次/千字</div>
          </div>

          <div className="card">
            <div className="card-label">节奏机械段落 (CV&lt;0.08)</div>
            <div className="card-value">
              {report.rhythm.monotonicSpans.length} <span className="unit">处</span>
            </div>
            <div className="card-sub">
              {report.rhythm.burstySpans.length > 0 ? `长短交错剧烈 ${report.rhythm.burstySpans.length} 处` : '节奏分布正常'}
            </div>
          </div>
        </section>
      )}

      {/* 主工作区：左侧文本与高亮预览，右侧统计详情 */}
      <div className="workspace-split">
        {/* 左侧：输入与原文高亮诊断 */}
        <div className="panel left-panel">
          <div className="panel-header">
            <span>原文输入与诊断透镜</span>
            <span className="count-hint">已输入 {text.length} 字符</span>
          </div>
          <textarea
            className="text-input"
            value={text}
            onChange={handleTextChange}
            placeholder="粘贴待诊断的中文文章、公文或论文..."
          />
          {report?.rhythm.maxSentence && (
            <div className="max-sentence-box">
              <span className="tag-alert">最长句曝光 (第 {report.rhythm.maxSentence.index + 1} 句，{report.rhythm.maxSentence.charCount} 字)</span>
              <p className="max-sentence-content">{report.rhythm.maxSentence.text}</p>
            </div>
          )}
        </div>

        {/* 右侧：口头禅分布与高频实义词 */}
        <div className="panel right-panel">
          <div className="panel-header">
            <span>口头禅/虚词分类统计</span>
            <span className="count-hint">{report?.petPhrases.items.length ?? 0} 种</span>
          </div>

          <div className="pet-list">
            {report?.petPhrases.items.map((item, idx) => (
              <div key={idx} className="pet-item">
                <span className="pet-phrase">{item.phrase}</span>
                <span className={`pet-cat cat-${item.category}`}>{item.category}</span>
                <span className="pet-count">{item.count} 次</span>
              </div>
            ))}
            {(!report || report.petPhrases.items.length === 0) && (
              <div className="empty-hint">未检出常见高频口头禅</div>
            )}
          </div>

          <div className="panel-header" style={{ marginTop: '16px' }}>
            <span>连续实义重复词组 (N-gram Top-10)</span>
          </div>
          <div className="ngram-list">
            {report?.repeatedNgrams.slice(0, 10).map((ng, i) => (
              <div key={i} className="ngram-item">
                <span className="ngram-word">{ng.ngram}</span>
                <span className="ngram-len">{ng.length} 连字</span>
                <span className="ngram-count">{ng.count} 次</span>
              </div>
            ))}
            {(!report || report.repeatedNgrams.length === 0) && (
              <div className="empty-hint">未检出重复实义词组 (频次&gt;=4)</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
