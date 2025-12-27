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

// Datos editoriales extraídos automáticamente del manuscrito (si están presentes)
export interface ExtractedEditorialData {
  isbn?: string;
  pages?: number;
  collection?: string;
  publisher?: string;
  originalTitle?: string;
  translator?: string;
  publicationYear?: string;
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
  extractedEditorialData?: ExtractedEditorialData;
}

export interface TranslatedResult {
    title: string;
    authorName: string;
    synopsis: string;
    authorBio: string;
}

export type BookFormat = "hardcover" | "paperback" | "ebook" | "audiobook";

export interface CommercialData {
    // Imágenes
    coverImageUrl?: string;
    authorPhotoUrl?: string;
    // Datos editoriales
    publisher?: string;
    publicationDate?: string;
    price?: number;
    currency?: "EUR" | "USD" | "GBP" | "MXN";
    isbn?: string;
    pages?: number;
    format?: BookFormat;
    // Datos adicionales para marketing
    collection?: string;
    originalTitle?: string;
    translator?: string;
}
