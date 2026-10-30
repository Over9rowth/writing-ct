// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
/**
 * 文风体检台 (writing-ct) - 核心算法域
 * 100% 按照 SPEC.md 锁定的数学公式与规则实现
 */

const PUNCTUATION_AND_SPACE_REGEX = /[\s\p{P}\p{S}]/u;
const COMMA_REGEX = /[，,、]/g;

// 内置 4 大类 32 个常见口头禅/虚词词库
const DEFAULT_PET_PHRASES = {
  hesitation: [
    '其实', '事实上', '某种程度上', '基本上',
    '大概', '可能', '老实说', '说白了'
  ],
  connector: [
    '然后', '那么', '所以说', '换句话说',
    '与此同时', '总而言之'
  ],
  passive_euro: [
    '被…所', '进行了', '做出了', '加以',
    '作为一个', '的直觉', '的本质'
  ],
  inflated: [
    '非常', '极其', '十分', '毫无疑问', '不言而喻'
  ]
};

// 常见纯虚字停用词集合（过滤纯虚词组成的 N-gram）
const STOP_CHARS = new Set('的了是在有和与及或这那就也又而因所由向往至自于从以把被让给但却然而虽然尽管不仅而且如果假使要是只要只有除非即便是尽管'.split(''));

/**
 * 中文智能分句器
 * 按 [。！？!?；;\n]+ 切分，正确处理闭合右引号及括号，计算有效字数与停顿比
 */
function splitSentences(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const sentences = [];
  const n = text.length;
  let sentIdx = 0;
  let paragraphIdx = 0;
  let startOffset = 0;
  let i = 0;

  const rightQuoteRegex = /[”」』）\)'"\]]/;

  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      // 换行切句并增加段落序号
      if (i > startOffset) {
        const segText = text.slice(startOffset, i);
        const sent = createSentence(segText, sentIdx++, startOffset, i, paragraphIdx);
        if (sent.charCount > 0) sentences.push(sent);
      }
      paragraphIdx++;
      i++;
      startOffset = i;
      continue;
    }

    if (ch === '。' || ch === '！' || ch === '!' || ch === '？' || ch === '?' || ch === '；' || ch === ';') {
      let end = i + 1;
      // 若句末标点后紧邻右引号/闭合括号，将其一并归入当前句
      while (end < n && rightQuoteRegex.test(text[end])) {
        end++;
      }
      const segText = text.slice(startOffset, end);
      const sent = createSentence(segText, sentIdx++, startOffset, end, paragraphIdx);
      if (sent.charCount > 0) sentences.push(sent);
      i = end;
      startOffset = i;
      continue;
    }

    i++;
  }

  if (startOffset < n) {
    const segText = text.slice(startOffset, n);
    const sent = createSentence(segText, sentIdx++, startOffset, n, paragraphIdx);
    if (sent.charCount > 0) sentences.push(sent);
  }

  return sentences;
}

function createSentence(rawText, index, startOffset, endOffset, paragraphIndex) {
  let charCount = 0;
  for (let j = 0; j < rawText.length; j++) {
    const c = rawText[j];
    if (!PUNCTUATION_AND_SPACE_REGEX.test(c)) {
      charCount++;
    }
  }

  const commaMatches = rawText.match(COMMA_REGEX);
  const commaCount = commaMatches ? commaMatches.length : 0;
  const pauseRatio = charCount > 0 ? Number((commaCount / charCount).toFixed(4)) : 0;

  return {
    index,
    text: rawText,
    charCount,
    commaCount,
    pauseRatio,
    startOffset,
    endOffset,
    paragraphIndex
  };
}

/**
 * 句长分布与节奏变异系数 (CV) 分析
 */
function analyzeRhythm(sentences) {
  if (!sentences || sentences.length === 0) {
    return {
      totalSentences: 0,
      totalChars: 0,
      meanLength: 0,
      stdDevLength: 0,
      medianLength: 0,
      p90Length: 0,
      maxSentence: null,
      longSentenceRatio: 0,
      monotonicSpans: [],
      burstySpans: []
    };
  }

  const totalSentences = sentences.length;
  const lengths = sentences.map(s => s.charCount);
  const totalChars = lengths.reduce((acc, cur) => acc + cur, 0);
  const meanLength = Number((totalChars / totalSentences).toFixed(2));

  // 标准差
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - meanLength, 2), 0) / totalSentences;
  const stdDevLength = Number(Math.sqrt(variance).toFixed(2));

  // 中位数与 P90
  const sortedLengths = [...lengths].sort((a, b) => a - b);
  const mid = Math.floor(sortedLengths.length / 2);
  const medianLength = sortedLengths.length % 2 === 0
    ? Number(((sortedLengths[mid - 1] + sortedLengths[mid]) / 2).toFixed(1))
    : sortedLengths[mid];

  const p90Idx = Math.min(sortedLengths.length - 1, Math.floor(sortedLengths.length * 0.9));
  const p90Length = sortedLengths[p90Idx];

  // 最长句
  let maxSentence = null;
  let maxLen = -1;
  let longCount = 0;

  sentences.forEach((s) => {
    if (s.charCount > maxLen) {
      maxLen = s.charCount;
      maxSentence = {
        index: s.index,
        charCount: s.charCount,
        text: s.text
      };
    }
    if (s.charCount > 60) {
      longCount++;
    }
  });

  const longSentenceRatio = Number((longCount / totalSentences).toFixed(4));

  // 局部节奏变异系数计算：滑窗大小 4 句
  // CV = sigma_L / mu_L
  // mu_L >= 10 且 CV < 0.08 => 节奏机械平直 (monotonicSpan)
  // CV > 0.65 => 长短句交错剧烈 (burstySpan)
  const monotonicSpans = [];
  const burstySpans = [];

  const windowSize = 4;
  for (let i = 0; i <= sentences.length - windowSize; i++) {
    const windowLengths = lengths.slice(i, i + windowSize);
    const winSum = windowLengths.reduce((a, b) => a + b, 0);
    const winMean = winSum / windowSize;
    if (winMean <= 0) continue;

    const winVariance = windowLengths.reduce((s, l) => s + Math.pow(l - winMean, 2), 0) / windowSize;
    const winStd = Math.sqrt(winVariance);
    const localCV = Number((winStd / winMean).toFixed(4));

    if (winMean >= 10 && localCV < 0.08) {
      monotonicSpans.push({
        startSentenceIdx: sentences[i].index,
        endSentenceIdx: sentences[i + windowSize - 1].index,
        localCV
      });
    } else if (localCV > 0.65) {
      burstySpans.push({
        startSentenceIdx: sentences[i].index,
        endSentenceIdx: sentences[i + windowSize - 1].index,
        localCV
      });
    }
  }

  return {
    totalSentences,
    totalChars,
    meanLength,
    stdDevLength,
    medianLength,
    p90Length,
    maxSentence,
    longSentenceRatio,
    monotonicSpans,
    burstySpans
  };
}

/**
 * 口头禅与虚词雷达扫描
 */
function scanPetPhrases(text, customPhrases) {
  if (!text || typeof text !== 'string') {
    return {
      totalHits: 0,
      hitsPerThousandChars: 0,
      byCategory: {},
      items: []
    };
  }

  let effectiveChars = 0;
  for (let i = 0; i < text.length; i++) {
    if (!PUNCTUATION_AND_SPACE_REGEX.test(text[i])) {
      effectiveChars++;
    }
  }

  const dict = {};
  for (const [cat, words] of Object.entries(DEFAULT_PET_PHRASES)) {
    for (const w of words) {
      dict[w] = cat;
    }
  }

  if (Array.isArray(customPhrases)) {
    for (const cw of customPhrases) {
      if (typeof cw === 'string' && cw.trim().length > 0) {
        dict[cw.trim()] = 'custom';
      }
    }
  }

  const items = [];
  const byCategory = {};
  let totalHits = 0;

  for (const [phrase, category] of Object.entries(dict)) {
    let offsets = [];
    if (phrase.includes('…')) {
      // 欧化句式如 "被…所"
      const parts = phrase.split('…');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const regex = new RegExp(`${escapeRegExp(parts[0])}([\\s\\S]{1,12}?)${escapeRegExp(parts[1])}`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
          offsets.push([match.index, match.index + match[0].length]);
        }
      }
    } else {
      let pos = 0;
      while ((pos = text.indexOf(phrase, pos)) !== -1) {
        offsets.push([pos, pos + phrase.length]);
        pos += phrase.length;
      }
    }

    if (offsets.length > 0) {
      items.push({
        phrase,
        category,
        count: offsets.length,
        offsets
      });
      totalHits += offsets.length;
      byCategory[category] = (byCategory[category] || 0) + offsets.length;
    }
  }

  items.sort((a, b) => b.count - a.count);

  const hitsPerThousandChars = effectiveChars > 0
    ? Number(((totalHits / effectiveChars) * 1000).toFixed(2))
    : 0;

  return {
    totalHits,
    hitsPerThousandChars,
    byCategory,
    items
  };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 连续汉字 2~4 元组实义重复探针
 */
function findRepeatedNgrams(text, options) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const minN = options && typeof options.minN === 'number' ? options.minN : 2;
  const maxN = options && typeof options.maxN === 'number' ? options.maxN : 6;
  const minCount = options && typeof options.minCount === 'number' ? options.minCount : 4;

  // 提取纯汉字连续片段
  const hanziRuns = [];
  const hanRegex = /[\u4e00-\u9fa5]+/g;
  let match;
  while ((match = hanRegex.exec(text)) !== null) {
    hanziRuns.push(match[0]);
  }

  const counts = new Map();

  for (const run of hanziRuns) {
    const len = run.length;
    for (let n = minN; n <= maxN; n++) {
      if (len < n) continue;
      for (let i = 0; i <= len - n; i++) {
        const gram = run.slice(i, i + n);
        // 过滤由纯虚词/停用字组成的短语
        let allStop = true;
        for (let j = 0; j < gram.length; j++) {
          if (!STOP_CHARS.has(gram[j])) {
            allStop = false;
            break;
          }
        }
        if (allStop) continue;

        counts.set(gram, (counts.get(gram) || 0) + 1);
      }
    }
  }

  const result = [];
  for (const [ngram, count] of counts.entries()) {
    if (count >= minCount) {
      result.push({
        ngram,
        length: ngram.length,
        count
      });
    }
  }

  result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.length - a.length;
  });

  return result.slice(0, 15);
}

/**
 * 全量综合文风体检
 */
function runWritingCT(text, options) {
  const sentences = splitSentences(text);
  const rhythm = analyzeRhythm(sentences);
  const petPhrases = scanPetPhrases(text, options && options.customPhrases);
  const repeatedNgrams = findRepeatedNgrams(text);

  // 整理所有高亮标注区域
  const highlights = [];

  // 口头禅标注
  petPhrases.items.forEach(item => {
    item.offsets.forEach(([start, end]) => {
      highlights.push({
        start,
        end,
        category: `petPhrase_${item.category}`,
        label: `${item.phrase} (${item.category})`
      });
    });
  });

  // 超长句标注 (charCount > 60)
  sentences.forEach(s => {
    if (s.charCount > 60) {
      highlights.push({
        start: s.startOffset,
        end: s.endOffset,
        category: 'longSentence',
        label: `长难句 (${s.charCount} 字)`
      });
    }
  });

  // 机械节奏段落标注
  rhythm.monotonicSpans.forEach(span => {
    const startS = sentences.find(s => s.index === span.startSentenceIdx);
    const endS = sentences.find(s => s.index === span.endSentenceIdx);
    if (startS && endS) {
      highlights.push({
        start: startS.startOffset,
        end: endS.endOffset,
        category: 'monotonicRhythm',
        label: `节奏机械平直 (CV: ${span.localCV})`
      });
    }
  });

  return {
    sentences,
    rhythm,
    petPhrases,
    repeatedNgrams,
    highlights
  };
}

module.exports = {
  splitSentences,
  analyzeRhythm,
  scanPetPhrases,
  findRepeatedNgrams,
  runWritingCT,
  DEFAULT_PET_PHRASES
};
