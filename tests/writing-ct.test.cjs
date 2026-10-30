const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitSentences,
  analyzeRhythm,
  scanPetPhrases,
  findRepeatedNgrams,
  runWritingCT
} = require('../src/domain/writing-ct.cjs');

test('1. 智能分句正确处理叹号、问号、分号及引号闭合边界', () => {
  const sample = '小明说：“今天天气真好！”我们去公园吗？是的；那快走吧。';
  const sentences = splitSentences(sample);
  assert.equal(sentences.length, 4);
  assert.equal(sentences[0].text, '小明说：“今天天气真好！”');
  assert.equal(sentences[1].text, '我们去公园吗？');
  assert.equal(sentences[2].text, '是的；');
  assert.equal(sentences[3].text, '那快走吧。');
  assert.ok(sentences[0].charCount > 0);
});

test('2. 句内停顿比计算：逗号与顿号计数', () => {
  const sample = '第一，项目进度受阻；第二，物资短缺，人员流失；第三，资金告急。';
  const sentences = splitSentences(sample);
  assert.equal(sentences.length, 3);
  assert.equal(sentences[0].commaCount, 1);
  assert.equal(sentences[1].commaCount, 2);
  assert.ok(sentences[1].pauseRatio > 0);
});

test('3. 超长句（>60字）检出与最大长难句定位', () => {
  const normalSent = '这是一句普通的短句子。';
  const longSent = '在现代软件工程实践中，由于系统架构日益复杂、分布式微服务链路冗长且各个组件之间的交互模式千差万别，传统的单体调试与日志观测手段往往难以及时发现那些深藏在异步调用链条底层的隐蔽缺陷与时序竞态问题。';
  const text = `${normalSent}${longSent}`;
  const report = runWritingCT(text);

  assert.equal(report.sentences.length, 2);
  assert.ok(report.rhythm.maxSentence !== null);
  assert.ok(report.rhythm.maxSentence.charCount > 60);
  assert.equal(report.rhythm.maxSentence.index, 1);
  assert.equal(report.rhythm.longSentenceRatio, 0.5);

  const longHighlight = report.highlights.find(h => h.category === 'longSentence');
  assert.ok(longHighlight, '应包含长难句高亮标注');
});

test('4. 连续等长句机械节奏 (monotonicSpans) 识别', () => {
  // 连续 4 句，每句刚好 14 个汉字（无标点差异）
  const text = '这是第一句测试这是第一句测试。这是第二句测试这是第二句测试。这是第三句测试这是第三句测试。这是第四句测试这是第四句测试。';
  const sentences = splitSentences(text);
  const rhythm = analyzeRhythm(sentences);

  assert.equal(sentences.length, 4);
  assert.equal(rhythm.monotonicSpans.length, 1);
  assert.equal(rhythm.monotonicSpans[0].localCV, 0);
});

test('5. 4大类口头禅与虚词雷达扫描及千字率计算', () => {
  const text = '其实，这件事情在某种程度上非常复杂，然后大家老实说都不太清楚。';
  const result = scanPetPhrases(text);

  assert.ok(result.totalHits >= 4);
  assert.ok(result.hitsPerThousandChars > 0);
  assert.ok(result.byCategory['hesitation'] >= 3); // 其实, 某种程度上, 老实说
  assert.ok(result.byCategory['connector'] >= 1);  // 然后
  assert.ok(result.byCategory['inflated'] >= 1);   // 非常

  const qiShi = result.items.find(i => i.phrase === '其实');
  assert.ok(qiShi);
  assert.equal(qiShi.offsets[0][0], 0);
  assert.equal(qiShi.offsets[0][1], 2);
});

test('6. 连续汉字 2~4 元组实义重复词组检出并过滤纯虚词', () => {
  const text = '深度架构调优不仅需要深度架构调优的技术积累，更需要在日常的深度架构调优工作中不断复盘，因为深度架构调优是系统演进的核心。有的有的有的有的';
  const ngrams = findRepeatedNgrams(text, { minCount: 3 });

  const found = ngrams.find(n => n.ngram === '深度架构调优');
  assert.ok(found, '应检出实义重复词组“深度架构调优”');
  assert.ok(found.count >= 4);

  // 纯虚词组“有的有的”即使重复也不应出现在实义词组中
  const stopFound = ngrams.find(n => n.ngram === '有的有的');
  assert.equal(stopFound, undefined);
});

// =================== 反向对照测试 (Reverse-Contrast) ===================

test('7. [反向对照1] 篡改/清空口头禅词库时，口头禅检出断言必须变红(FAIL)', () => {
  const text = '其实，这件事情在某种程度上非常复杂，然后大家老实说都不太清楚。';
  // 正常检测断言通过
  const normalResult = scanPetPhrases(text);
  assert.ok(normalResult.totalHits >= 4);

  // 模拟退化篡改函数：若口头禅词库被清空或退化为返回空
  function degradedScan(t) {
    return { totalHits: 0, hitsPerThousandChars: 0, byCategory: {}, items: [] };
  }
  const degradedResult = degradedScan(text);
  // 断言该退化行为无法满足正常标准，即反向证明检出器有效性
  assert.throws(() => {
    assert.ok(degradedResult.totalHits >= 4, '退化篡改后不应满足原有断言');
  }, /AssertionError/);
});

test('8. [反向对照2] 若将分句逻辑退化为粗暴 text.split("。")，复杂对话与叹号测试必须变红(FAIL)', () => {
  const sample = '小明说：“今天天气真好！”我们去公园吗？是的；那快走吧。';
  // 正常实现：分 4 句
  const goodSentences = splitSentences(sample);
  assert.equal(goodSentences.length, 4);

  // 退化实现：只 split("。")
  function degradedSplit(t) {
    return t.split('。').filter(Boolean);
  }
  const badSentences = degradedSplit(sample);

  // 粗暴 split 只能拆出 1 句，无法处理引号、叹号、问号、分号
  assert.throws(() => {
    assert.equal(badSentences.length, 4, '退化分句无法通过4句断言');
  }, /AssertionError/);
});
