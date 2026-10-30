export interface SentenceItem {
  index: number;
  text: string;
  charCount: number;
  commaCount: number;
  pauseRatio: number;
  startOffset: number;
  endOffset: number;
  paragraphIndex: number;
}

export interface RhythmAnalysis {
  totalSentences: number;
  totalChars: number;
  meanLength: number;
  stdDevLength: number;
  medianLength: number;
  p90Length: number;
  maxSentence: {
    index: number;
    charCount: number;
    text: string;
  } | null;
  longSentenceRatio: number;
  monotonicSpans: Array<{
    startSentenceIdx: number;
    endSentenceIdx: number;
    localCV: number;
  }>;
  burstySpans: Array<{
    startSentenceIdx: number;
    endSentenceIdx: number;
    localCV: number;
  }>;
}

export interface PetPhraseItem {
  phrase: string;
  category: string;
  count: number;
  offsets: Array<[number, number]>;
}

export interface PetPhraseAnalysis {
  totalHits: number;
  hitsPerThousandChars: number;
  byCategory: Record<string, number>;
  items: PetPhraseItem[];
}

export interface RepeatedNgramItem {
  ngram: string;
  length: number;
  count: number;
}

export interface WritingCTHighlight {
  start: number;
  end: number;
  category: string;
  label: string;
}

export interface WritingCTReport {
  sentences: SentenceItem[];
  rhythm: RhythmAnalysis;
  petPhrases: PetPhraseAnalysis;
  repeatedNgrams: RepeatedNgramItem[];
  highlights: WritingCTHighlight[];
}

export declare function splitSentences(text: string): SentenceItem[];
export declare function analyzeRhythm(sentences: SentenceItem[]): RhythmAnalysis;
export declare function scanPetPhrases(text: string, customPhrases?: string[]): PetPhraseAnalysis;
export declare function findRepeatedNgrams(text: string, options?: { minN?: number; maxN?: number; minCount?: number }): RepeatedNgramItem[];
export declare function runWritingCT(text: string, options?: { customPhrases?: string[] }): WritingCTReport;
export declare const DEFAULT_PET_PHRASES: Record<string, string[]>;
