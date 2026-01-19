export interface EtymologyComponent {
  part: string;
  meaning: string;
  meaningKo?: string;  // deprecated, use meaningLocalized
  meaningLocalized?: string;
}

export interface EtymologyOrigin {
  language: string;
  root: string;
  rootMeaning?: string;
  components: EtymologyComponent[];
}

export interface EtymologyDefinition {
  brief: string;       // 간단한 뜻 (구실, 핑계)
  detailed: string;    // 상세 설명
  nuance: string;      // 뉘앙스 설명
}

export interface EtymologyExample {
  english: string;     // 영어 예문
  translation: string; // 번역된 예문
}

export interface EtymologyEvolution {
  path: string;        // 변화 경로 (Latin → Old French → English)
  explanation: string; // 의미 변화 설명
}

export interface EtymologyDerivative {
  word: string;
  meaning: string;
}

export interface EtymologySynonym {
  word: string;
  meaning: string;
  nuance: string;
}

export interface EtymologySense {
  meaning: string;           // 번역된 의미 (e.g., 수도)
  english: string;           // 영어 표현 (e.g., capital city)
  domain: string;            // 의미 영역 (e.g., politics, finance)
  metaphoricalExtension: string;  // 은유적 확장 설명 (e.g., 머리 → 나라의 중심)
  example?: EtymologyExample;
}

export interface Etymology {
  word: string;
  definition?: EtymologyDefinition;
  examples?: EtymologyExample[];
  origin: EtymologyOrigin;
  evolution: string | EtymologyEvolution;
  historicalContext?: string;
  originalMeaning: string;
  originalMeaningKo?: string;  // deprecated, use originalMeaningLocalized
  originalMeaningLocalized?: string;
  modernMeaning: string;
  modernMeaningKo?: string;  // deprecated, use modernMeaningLocalized
  modernMeaningLocalized?: string;
  derivatives?: EtymologyDerivative[];  // 같은 어근을 공유하는 파생어들
  synonyms?: EtymologySynonym[];  // 비슷한 의미지만 다른 어원의 동의어들
  senses?: EtymologySense[];  // 다의어 의미 분화 (2개 이상일 때만 표시)
}

export interface Derivative {
  word: string;
  meaning: string;
  relationship: string;
}

export interface DerivativesData {
  word: string;
  root: string;
  rootMeaning: string;
  derivatives: Derivative[];
}

export interface Synonym {
  word: string;
  definition: string;
  nuance: string;
  usage: string;
  example: string;
}

export interface SynonymsData {
  word: string;
  definition: string;
  synonyms: Synonym[];
}

export interface Word {
  id: number;
  word: string;
  language: string;
  etymology: Etymology | null;
  etymologyPrev?: Etymology | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWord {
  id: number;
  order: number;
  parentId: number | null;
  word: Word;
}

export interface Session {
  id: number;
  name: string | null;
  createdAt: string;
  expiresAt: string;
  words: SessionWord[];
}

export interface GraphNode {
  id: string;
  word: string;
  etymology: Etymology | null;
  order: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface SessionGraph {
  session: {
    id: string;
    name: string | null;
    createdAt: string;
  };
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}
