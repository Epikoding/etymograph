export interface EtymologyComponent {
  part: string;
  meaning: string;
}

export interface EtymologyOrigin {
  language: string;
  root: string;
  components: EtymologyComponent[];
}

export interface Etymology {
  word: string;
  origin: EtymologyOrigin;
  evolution: string;
  originalMeaning: string;
  modernMeaning: string;
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
  id: string;
  word: string;
  etymology: Etymology | null;
  derivatives: string[];
  synonyms: SynonymsData | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWord {
  id: string;
  order: number;
  parentId: string | null;
  word: Word;
}

export interface Session {
  id: string;
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
