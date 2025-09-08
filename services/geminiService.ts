import { AnalysisResult, CitationInfo, TranslatedResult } from '../types';

// --- IMPORTANTE ---
// Después de ejecutar 'firebase deploy', la consola te dará las URLs de tus funciones.
// Debes copiarlas y pegarlas aquí.
const GET_ANALYSIS_URL = "https://geteditorialanalysis-d5qcgs7kva-uc.a.run.app";
const GET_TRANSLATION_URL = "https://gettranslation-d5qcgs7kva-uc.a.run.app";


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