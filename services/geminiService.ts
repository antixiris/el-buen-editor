import { AnalysisResult, CitationInfo, TranslatedResult } from '../types';

// --- IMPORTANTE ---
// Después de ejecutar 'firebase deploy', la consola te dará las URLs de tus funciones.
// Debes copiarlas y pegarlas aquí.
const GET_ANALYSIS_URL = "https://geteditorialanalysis-d5qcgs7kva-uc.a.run.app";
const GET_TRANSLATION_URL = "https://gettranslation-d5qcgs7kva-uc.a.run.app";
const GET_ARTICLE_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getArticleReview";
const GET_PRESS_RELEASE_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getPressRelease";
const GET_INTERVIEW_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getInterview";
const GET_BACK_COVER_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getBackCoverText";
const GET_SOCIAL_MEDIA_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getSocialMediaPosts";
const GET_SALES_PITCH_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getSalesPitch";
const GET_BOOKSTORE_EMAIL_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getBookstoreEmail";
const GET_READING_REPORT_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getReadingReport";
const GET_COMPARABLES_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getComparables";
const GET_SEO_KEYWORDS_URL = "https://us-central1-el-buen-editor.cloudfunctions.net/getSeoKeywords";


export const getAnalysis = async (text: string, wordCount: number): Promise<AnalysisResult> => {
    if (GET_ANALYSIS_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function no ha sido configurada en services/geminiService.ts");
    }
    
    try {
        const response = await fetch(GET_ANALYSIS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, wordCount }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as AnalysisResult;

    } catch (error) {
        console.error("Error llamando a la función de análisis:", error);
        throw new Error("La comunicación con el servicio de análisis falló. Por favor, revisa la URL de la función y la consola del backend.");
    }
};

export const getTranslation = async (data: AnalysisResult): Promise<TranslatedResult> => {
    if (GET_TRANSLATION_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de traducción no ha sido configurada en services/geminiService.ts");
    }

    try {
        const response = await fetch(GET_TRANSLATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend de traducción: ${response.status} ${errorText}`);
        }
        
        const result = await response.json();
        return result as TranslatedResult;

    } catch(error) {
        console.error("Error llamando a la función de traducción:", error);
        throw new Error("La comunicación con el servicio de traducción falló.");
    }
}

// Las citas se pueden seguir generando en el cliente, ya que no requieren una API Key.
const generateCitations = (title: string, author: string, info: CitationInfo): AnalysisResult['citations'] => {
    const p = info.publisher || '[Editorial]';
    const y = info.year || '[Año]';
    const c = info.city || '[Ciudad]';
    
    return {
        apa: `${author}. (${y}). *${title}*. ${p}.`,
        mla: `${author}. *${title}*. ${p}, ${y}.`,
        chicago: `${author}. *${title}*. ${c}: ${p}, ${y}.`,
        harvard: `${author} (${y}). *${title}*. ${c}: ${p}.`,
        vancouver: `${author}. ${title}. ${c}: ${p}; ${y}.`
    };
};

export const getUpdatedCitations = async (title: string, authorName: string, info: CitationInfo): Promise<AnalysisResult['citations']> => {
    // Esto es síncrono y rápido, por lo que no necesita ser una llamada de red.
    return Promise.resolve(generateCitations(title, authorName, info));
}

export const getArticle = async (data: AnalysisResult): Promise<string> => {
    if (GET_ARTICLE_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de artículos no ha sido configurada en services/geminiService.ts. Ejecuta 'firebase deploy' y copia la URL de getArticleReview.");
    }

    try {
        const response = await fetch(GET_ARTICLE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend de artículos: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.article as string;

    } catch(error) {
        console.error("Error llamando a la función de artículos:", error);
        throw new Error("La comunicación con el servicio de generación de artículos falló.");
    }
}

export const getPressRelease = async (data: AnalysisResult): Promise<string> => {
    if (GET_PRESS_RELEASE_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de comunicados no ha sido configurada en services/geminiService.ts.");
    }

    try {
        const response = await fetch(GET_PRESS_RELEASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend de comunicados: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.pressRelease as string;

    } catch(error) {
        console.error("Error llamando a la función de comunicados:", error);
        throw new Error("La comunicación con el servicio de generación de comunicados falló.");
    }
}

export interface InterviewResult {
    introduction: string;
    questions: string[];
}

export const getInterview = async (data: AnalysisResult): Promise<InterviewResult> => {
    if (GET_INTERVIEW_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de entrevistas no ha sido configurada en services/geminiService.ts.");
    }

    try {
        const response = await fetch(GET_INTERVIEW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend de entrevistas: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as InterviewResult;

    } catch(error) {
        console.error("Error llamando a la función de entrevistas:", error);
        throw new Error("La comunicación con el servicio de generación de entrevistas falló.");
    }
}

export const getBackCoverText = async (data: AnalysisResult): Promise<string> => {
    if (GET_BACK_COVER_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de texto de solapa no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_BACK_COVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.backCoverText as string;

    } catch(error) {
        console.error("Error llamando a la función de texto de solapa:", error);
        throw new Error("La comunicación con el servicio de texto de solapa falló.");
    }
}

export interface SocialMediaPosts {
    twitter: string;
    instagram: string;
    facebook: string;
    linkedin: string;
}

export const getSocialMediaPosts = async (data: AnalysisResult): Promise<SocialMediaPosts> => {
    if (GET_SOCIAL_MEDIA_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de redes sociales no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_SOCIAL_MEDIA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as SocialMediaPosts;

    } catch(error) {
        console.error("Error llamando a la función de redes sociales:", error);
        throw new Error("La comunicación con el servicio de redes sociales falló.");
    }
}

export interface SalesPitchResult {
    targetAudience: string;
    salesHooks: string[];
    differentiators: string[];
    objectionHandlers: string[];
    elevatorPitch: string;
}

export const getSalesPitch = async (data: AnalysisResult): Promise<SalesPitchResult> => {
    if (GET_SALES_PITCH_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de argumentario no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_SALES_PITCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as SalesPitchResult;

    } catch(error) {
        console.error("Error llamando a la función de argumentario:", error);
        throw new Error("La comunicación con el servicio de argumentario de ventas falló.");
    }
}

export interface BookstoreEmailResult {
    subject: string;
    body: string;
}

export const getBookstoreEmail = async (data: AnalysisResult): Promise<BookstoreEmailResult> => {
    if (GET_BOOKSTORE_EMAIL_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de email a libreros no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_BOOKSTORE_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as BookstoreEmailResult;

    } catch(error) {
        console.error("Error llamando a la función de email a libreros:", error);
        throw new Error("La comunicación con el servicio de email a libreros falló.");
    }
}

export interface ReadingReportResult {
    summary: string;
    literaryAnalysis: string;
    strengths: string[];
    weaknesses: string[];
    marketAnalysis: string;
    targetAudience: string;
    recommendation: 'PUBLICAR' | 'PUBLICAR_CON_CAMBIOS' | 'RECHAZAR';
    recommendationJustification: string;
}

export const getReadingReport = async (data: AnalysisResult): Promise<ReadingReportResult> => {
    if (GET_READING_REPORT_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de informe de lectura no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_READING_REPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as ReadingReportResult;

    } catch(error) {
        console.error("Error llamando a la función de informe de lectura:", error);
        throw new Error("La comunicación con el servicio de informe de lectura falló.");
    }
}

export interface Comparable {
    title: string;
    author: string;
    publisher: string;
    year: number;
    reason: string;
    differentiator: string;
}

export interface ComparablesResult {
    comparables: Comparable[];
    marketPositioning: string;
}

export const getComparables = async (data: AnalysisResult): Promise<ComparablesResult> => {
    if (GET_COMPARABLES_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de comparables no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_COMPARABLES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as ComparablesResult;

    } catch(error) {
        console.error("Error llamando a la función de comparables:", error);
        throw new Error("La comunicación con el servicio de comparables falló.");
    }
}

export interface SeoKeywordsResult {
    primaryKeywords: string[];
    longTailKeywords: string[];
    thematicKeywords: string[];
    audienceKeywords: string[];
    amazonCategories: string[];
    metaDescription: string;
}

export const getSeoKeywords = async (data: AnalysisResult): Promise<SeoKeywordsResult> => {
    if (GET_SEO_KEYWORDS_URL.includes("[URL")) {
        throw new Error("La URL de la Firebase Function de SEO no ha sido configurada.");
    }

    try {
        const response = await fetch(GET_SEO_KEYWORDS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error desde el backend: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result as SeoKeywordsResult;

    } catch(error) {
        console.error("Error llamando a la función de SEO:", error);
        throw new Error("La comunicación con el servicio de palabras clave SEO falló.");
    }
}