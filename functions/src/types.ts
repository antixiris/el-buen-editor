export interface SubjectClassification {
  main: { code: string; description: string; justification: string }[];
  secondary: { code: string; description: string; justification: string }[];
  related: { code: string; description: string; justification: string }[];
}

export interface CitationInfo {
  publisher?: string;
  year?: string;
  city?: string;
}

export interface AnalysisResult {
  title: string;
  foundSubtitle: string | null;
  subtitleSuggestions: string[];
  authorName: string;
  authorBio: string;
  synopsis: string;
  wordCount: number;
  tags: string[];
  classifications: {
    bisac: SubjectClassification;
    thema: SubjectClassification;
    ibic: SubjectClassification;
  };
  citations: {
    apa: string;
    mla: string;
    chicago: string;
    harvard: string;
    vancouver: string;
  };
  rawText: string;
}

export interface TranslatedResult {
    title: string;
    authorName: string;
    synopsis: string;
    authorBio: string;
}
