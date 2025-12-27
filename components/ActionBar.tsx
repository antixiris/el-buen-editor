import React, { FC } from 'react';
import { AnalysisResult, TranslatedResult, CommercialData } from '@/types';
import { exportToPdf, copyToClipboard, exportToOnix } from '@/services/utils';

interface ActionBarProps {
    result: AnalysisResult;
    translatedResult: TranslatedResult | null;
    isTranslating: boolean;
    onTranslate: () => void;
    commercialData?: CommercialData;
}

export const ActionBar: FC<ActionBarProps> = ({
    result,
    translatedResult,
    isTranslating,
    onTranslate,
    commercialData
}) => {
    return (
        <div className="flex flex-wrap gap-2 items-center">
            {/* Grupo: Exportación */}
            <div className="flex gap-2 items-center">
                <button
                    onClick={() => exportToPdf(result)}
                    className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2"
                    title="Exportar análisis completo a PDF"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                </button>

                {translatedResult && (
                    <button
                        onClick={() => exportToPdf(result, translatedResult)}
                        className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2"
                        title="Exportar versión traducida a PDF"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        PDF (EN)
                    </button>
                )}

                <button
                    onClick={() => exportToOnix(result)}
                    className="px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2"
                    title="Exportar metadatos en formato ONIX 3.0"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    ONIX
                </button>
            </div>

            {/* Separador visual */}
            <div className="w-px h-8 bg-gray-300 mx-1 hidden sm:block" />

            {/* Grupo: Copiar y Traducir */}
            <div className="flex gap-2 items-center">
                <button
                    onClick={() => copyToClipboard(result)}
                    className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2"
                    title="Copiar para pegar en Google Docs"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copiar Docs
                </button>

                <button
                    onClick={onTranslate}
                    disabled={isTranslating}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Traducir análisis al inglés"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    {isTranslating ? 'Traduciendo...' : 'Traducir'}
                </button>
            </div>
        </div>
    );
};
