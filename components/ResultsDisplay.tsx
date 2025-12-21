import React, { FC, useState } from 'react';
import { getTranslation } from '@/services/geminiService';
import { renderWithItalics } from '@/services/utils';
import { AnalysisResult, TranslatedResult, SubjectClassification } from '@/types';
import { ActionBar } from './ActionBar';

interface ResultsDisplayProps {
    result: AnalysisResult;
}

export const ResultsDisplay: FC<ResultsDisplayProps> = ({ result }) => {
    const [translatedResult, setTranslatedResult] = useState<TranslatedResult | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);

    const handleTranslateClick = async () => {
        setIsTranslating(true);
        try {
            const translation = await getTranslation(result);
            setTranslatedResult(translation);
        } catch(err) {
            console.error(err);
            alert("Error al traducir el contenido.");
        } finally {
            setIsTranslating(false);
        }
    };

    const renderClassificationItems = (title: string, items: { code: string; description: string; justification: string }[]) => (
        <div>
            <b className="font-semibold">{title}:</b>
            {items && items.length > 0 ? (
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    {items.map((item, index) => (
                        <li key={index}>
                            {item.description} ({item.code})
                            <p className="text-xs text-gray-500 pl-6 italic">Justificación: {item.justification}</p>
                        </li>
                    ))}
                </ul>
            ) : (
                <span className="ml-2 text-gray-500 italic">No disponible</span>
            )}
        </div>
    );

    const renderClassification = (title: string, data: SubjectClassification) => (
        <div className="mb-4">
            <h4 className="font-semibold text-lg text-indigo-700">{title}</h4>
            <div className="ml-4 mt-2 text-sm space-y-3">
                {renderClassificationItems("Principal", data.main)}
                {renderClassificationItems("Secundario", data.secondary)}
                {renderClassificationItems("Relacionado", data.related)}
            </div>
        </div>
    );

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg space-y-6">
            {/* Encabezado con información del libro */}
            <div className="border-b pb-4">
                <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-800">{result.title}</h2>
                        {result.foundSubtitle && (
                            <p className="text-lg text-gray-600 italic mt-1">{result.foundSubtitle}</p>
                        )}
                        <p className="text-md text-gray-700 font-medium mt-2">{result.authorName}</p>
                    </div>
                </div>
            </div>

            {/* Barra de acciones (exportar, copiar, traducir) */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <ActionBar
                    result={result}
                    translatedResult={translatedResult}
                    isTranslating={isTranslating}
                    onTranslate={handleTranslateClick}
                />
            </div>

            {/* Sinopsis */}
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                    <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                    Sinopsis Comercial
                </h3>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{renderWithItalics(result.synopsis)}</p>
            </div>

            {/* Biografía */}
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                    <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                    Nota Biográfica del Autor
                </h3>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{renderWithItalics(result.authorBio)}</p>
            </div>

            {/* Clasificaciones */}
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                    <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                    Clasificación por Materias
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                        {renderClassification("BISAC", result.classifications.bisac)}
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        {renderClassification("THEMA", result.classifications.thema)}
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        {renderClassification("IBIC", result.classifications.ibic)}
                    </div>
                </div>
            </div>

            {/* Etiquetas y datos */}
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                    <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
                    Etiquetas y Datos
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                    {result.tags.map((tag, i) => (
                        <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                            {tag}
                        </span>
                    ))}
                </div>
                <p className="text-sm text-gray-600">
                    <span className="font-semibold">Extensión:</span> {result.wordCount.toLocaleString('es-ES')} palabras
                </p>
            </div>

            {/* Citas */}
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                    <span className="w-1 h-6 bg-rose-500 rounded-full"></span>
                    Cómo Citar
                </h3>
                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg">
                    <p><b className="text-gray-600">APA:</b> <span className="text-gray-800">{renderWithItalics(result.citations.apa)}</span></p>
                    <p><b className="text-gray-600">MLA:</b> <span className="text-gray-800">{renderWithItalics(result.citations.mla)}</span></p>
                    <p><b className="text-gray-600">Chicago:</b> <span className="text-gray-800">{renderWithItalics(result.citations.chicago)}</span></p>
                    <p><b className="text-gray-600">Harvard:</b> <span className="text-gray-800">{renderWithItalics(result.citations.harvard)}</span></p>
                    <p><b className="text-gray-600">Vancouver:</b> <span className="text-gray-800">{renderWithItalics(result.citations.vancouver)}</span></p>
                </div>
            </div>

            {/* Sugerencias de subtítulo */}
            {result.subtitleSuggestions && result.subtitleSuggestions.length > 0 && (
                <div className="border-t pt-4">
                    <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center gap-2">
                        <span className="w-1 h-6 bg-cyan-500 rounded-full"></span>
                        Sugerencias de Subtítulo
                    </h3>
                    <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                        {result.subtitleSuggestions.map((s, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-cyan-500 mt-0.5">•</span>
                                <span className="text-gray-700">{s}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
