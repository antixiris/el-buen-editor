import React, { useState, useCallback } from 'react';
import { getAnalysis, getUpdatedCitations } from './services/geminiService';
import { extractTextFromFile } from './services/utils';
import { logBookAnalysis } from './services/activityLog';
import { AnalysisResult, CitationInfo, CommercialData } from './types';
import { useAuth } from '@/contexts/AuthContext';

import { Disclaimer } from './components/Disclaimer';
import { Loader } from './components/Loader';
import { FileUploader } from './components/FileUploader';
import { ResultsDisplay } from './components/ResultsDisplay';
import { CitationModal } from './components/CitationModal';
import { TitleModal } from './components/TitleModal';
import { LoginScreen } from './components/LoginScreen';
import { UserMenu } from './components/UserMenu';
import { ActivityLog } from './components/ActivityLog';
import { HeaderContentBar } from './components/HeaderContentBar';
import { ChatPanel } from './components/ChatPanel';
import { CommercialDataPanel } from './components/CommercialDataPanel';

export default function App() {
    const { user, loading: authLoading } = useAuth();
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
    const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
    const [commercialData, setCommercialData] = useState<CommercialData>({});

    // IMPORTANTE: Todos los hooks deben estar ANTES de cualquier return condicional
    const handleFileUpload = useCallback(async (file: File) => {
        if (!user) return;

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        setCommercialData({}); // Limpiar datos comerciales al subir nuevo archivo

        try {
            setLoadingMessage('Extrayendo texto del documento...');
            const text = await extractTextFromFile(file);

            if (!text || text.trim().length < 100) {
                 throw new Error("El documento está vacío o no se pudo extraer texto suficiente para el análisis.");
            }

            const wordCount = text.trim().split(/\s+/).length;

            setLoadingMessage('Analizando con IA... Esto puede tardar un momento.');
            const result = await getAnalysis(text, wordCount);

            setAnalysisResult(result);

            // Pre-rellenar datos comerciales si se extrajeron del manuscrito
            if (result.extractedEditorialData) {
                const extracted = result.extractedEditorialData;
                setCommercialData(prev => ({
                    ...prev,
                    ...(extracted.isbn && { isbn: extracted.isbn }),
                    ...(extracted.pages && { pages: extracted.pages }),
                    ...(extracted.collection && { collection: extracted.collection }),
                    ...(extracted.publisher && { publisher: extracted.publisher }),
                    ...(extracted.originalTitle && { originalTitle: extracted.originalTitle }),
                    ...(extracted.translator && { translator: extracted.translator }),
                    ...(extracted.publicationYear && {
                        publicationDate: `${extracted.publicationYear}-01-01`
                    }),
                }));
            }

            // Registrar la actividad en Firestore (no bloqueante)
            logBookAnalysis(
                result.title,
                result.authorName,
                result.wordCount,
                user.email || 'unknown',
                user.displayName || 'Usuario'
            ).catch(err => console.warn('No se pudo registrar la actividad:', err));

            if (result.title === 'TÍTULO NO ENCONTRADO') {
                setIsTitleModalOpen(true);
            } else {
                 const needsInput = Object.values(result.citations).some(citation =>
                    citation.includes('[Editorial]') || citation.includes('[Año]') || citation.includes('[Ciudad]')
                );
                if (needsInput) {
                    setIsCitationModalOpen(true);
                }
            }

        } catch (err: any) {
            setError(err.message || 'Ocurrió un error desconocido.');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [user]);

    const handleUpdateCitations = useCallback(async (info: CitationInfo) => {
        if (!analysisResult) return;

        try {
            setIsLoading(true);
            setLoadingMessage('Actualizando citas...');
            const newCitations = await getUpdatedCitations(
                analysisResult.title,
                analysisResult.authorName,
                info
            );
            setAnalysisResult(prev => prev ? { ...prev, citations: newCitations } : null);
            setIsCitationModalOpen(false);
        } catch (error) {
            console.error("Failed to update citations:", error);
            setError("No se pudieron actualizar las citas.");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [analysisResult]);

    const handleUpdateTitle = useCallback((newTitle: string) => {
        if (!analysisResult) return;

        const updatedResult = { ...analysisResult, title: newTitle };
        setAnalysisResult(updatedResult);
        setIsTitleModalOpen(false);

        const needsCitationInput = Object.values(updatedResult.citations).some(citation =>
            citation.includes('[Editorial]') || citation.includes('[Año]') || citation.includes('[Ciudad]')
        );

        if (needsCitationInput) {
            setIsCitationModalOpen(true);
        }
    }, [analysisResult]);

    // Ahora sí podemos hacer returns condicionales
    if (authLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                        <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                    <p className="text-gray-600">Cargando...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <LoginScreen />;
    }

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex-shrink-0">
                            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">
                                El Buen Editor
                            </h1>
                            <p className="text-sm text-gray-600 hidden sm:block">Asistente de fichas para el gestor</p>
                        </div>
                        <div className="flex-1 flex justify-center">
                            <HeaderContentBar result={analysisResult} commercialData={commercialData} />
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-3">
                            <button
                                onClick={() => setIsActivityLogOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Historial
                            </button>
                            <UserMenu />
                        </div>
                    </div>
                </div>
            </header>
            <main>
                <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    <div className="px-4 py-6 sm:px-0">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1 space-y-6">
                                <div className="p-6 bg-white rounded-lg shadow-md">
                                    <h2 className="text-xl font-semibold mb-4">1. Subir Manuscrito</h2>
                                    <FileUploader onFileUpload={handleFileUpload} isLoading={isLoading} disabled={isLoading} />
                                </div>
                                {analysisResult && (
                                    <CommercialDataPanel
                                        data={commercialData}
                                        onChange={setCommercialData}
                                    />
                                )}
                                <Disclaimer />
                            </div>
                            <div className="lg:col-span-2">
                                {isLoading ? (
                                    <Loader message={loadingMessage} />
                                ) : error ? (
                                    <div className="p-6 bg-red-100 border-l-4 border-red-500 text-red-700">
                                        <h3 className="font-bold">Error</h3>
                                        <p>{error}</p>
                                    </div>
                                ) : analysisResult ? (
                                    <ResultsDisplay result={analysisResult} commercialData={commercialData} />
                                ) : (
                                    <div className="p-6 bg-white rounded-lg shadow-md text-center text-gray-500">
                                        <h2 className="text-xl font-semibold mb-2">2. Esperando Análisis</h2>
                                        <p>Una vez que subas un manuscrito, los resultados del análisis aparecerán aquí.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <CitationModal isOpen={isCitationModalOpen} onClose={() => setIsCitationModalOpen(false)} onSubmit={handleUpdateCitations} />
            <TitleModal isOpen={isTitleModalOpen} onClose={() => setIsTitleModalOpen(false)} onSubmit={handleUpdateTitle} />
            <ActivityLog isOpen={isActivityLogOpen} onClose={() => setIsActivityLogOpen(false)} />
            {analysisResult && <ChatPanel bookAnalysis={analysisResult} commercialData={commercialData} />}
        </div>
    );
}
