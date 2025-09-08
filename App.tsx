import React, { useState, useCallback, FC } from 'react';
import { getAnalysis, getTranslation, getUpdatedCitations } from './services/geminiService';
import { extractTextFromFile, exportToPdf, copyToClipboard } from './services/utils';
import { AnalysisResult, CitationInfo, TranslatedResult, SubjectClassification } from './types';

// Sub-Components defined within App.tsx to reduce file count

const Disclaimer: FC = () => (
    <div className="mt-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 text-sm">
        <h4 className="font-bold">INFORMACIÓN RELEVANTE:</h4>
        <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Esta aplicación no está conectada a ninguna base de datos y no almacena información de los libros subidos.</li>
            <li>Las materias IBIC, BISAC y THEMA están confrontadas con listados vigentes almacenados en una base de conocimiento estática, es decir, son materias seleccionadas por la aplicación sobre listados oficiales y reales no inventados o especulados por la IA.</li>
            <li>La sinopsis es un texto generado por la IA a modo de propuesta inicial. Es responsabilidad del editor mejorarlo, adaptarlo o crear uno nuevo. Sirva solo como referencia.</li>
            <li>La biografía del autor, si no está detallada dentro del contenido del libro subido, es generada mediante un proceso de investigación que hace la IA en internet. Es posible, por tanto, que ofrezca datos inexactos, no contrastados o relativos a otra persona.</li>
        </ul>
        <h4 className="font-bold mt-4">ADVERTENCIA AL EDITOR</h4>
        <p className="mt-1">
            Esta aplicación es una herramienta dirigida a agilizar la obtención de datos para rellenar la ficha del libro en el gestor y tiene un valor meramente consultivo y funcional. El editor es responsable directo de la información que vierte en el gestor, principal base de trabajo del equipo editorial.
        </p>
    </div>
);

const Loader: FC<{ message: string }> = ({ message }) => (
    <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-white shadow-sm">
        <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-600 font-medium">{message}</p>
    </div>
);

interface FileUploaderProps {
    onFileUpload: (file: File) => void;
    isLoading: boolean;
    disabled: boolean;
}
const FileUploader: FC<FileUploaderProps> = ({ onFileUpload, isLoading, disabled }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className="w-full">
            <label 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`flex flex-col items-center justify-center text-center px-4 py-10 bg-white text-blue rounded-lg shadow-lg tracking-wide uppercase border-2 border-dashed  cursor-pointer ${ disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-indigo-50 hover:border-indigo-500'}`}
                htmlFor="file-upload"
            >
                <svg className="w-12 h-12" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M16.88 9.1A4 4 0 0 1 16 17H5a5 5 0 0 1-1-9.9V7a3 3 0 0 1 4.52-2.59A4.98 4.98 0 0 1 17 8c0 .38-.04.74-.12 1.1zM11 11h3l-4 4-4-4h3v-4h2v4z" />
                </svg>
                <span className="mt-2 text-base leading-normal">SELECCIONA UN ARCHIVO PDF O DOCX</span>
                <span className="text-sm text-gray-500">o arrástralo aquí</span>
            </label>
            <input id="file-upload" type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} disabled={disabled} />
        </div>
    );
};

const renderWithItalics = (text: string | null | undefined) => {
    if (!text) return null;
    const parts = text.split(/(\*.*?\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('*') && part.endsWith('*')) {
            return <i key={index}>{part.substring(1, part.length - 1)}</i>;
        }
        return part;
    });
};

interface ResultsDisplayProps {
    result: AnalysisResult;
}
const ResultsDisplay: FC<ResultsDisplayProps> = ({ result }) => {
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
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                 <div>
                    <h2 className="text-2xl font-bold text-gray-800">{result.title}</h2>
                    {result.foundSubtitle && <p className="text-lg text-gray-600 italic">{result.foundSubtitle}</p>}
                    <p className="text-md text-gray-700 font-medium mt-1">{result.authorName}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => exportToPdf(result)} className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition">Exportar a PDF</button>
                    <button onClick={handleTranslateClick} disabled={isTranslating} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50">
                        {isTranslating ? 'Traduciendo...' : 'Traducir'}
                    </button>
                    {translatedResult && <button onClick={() => exportToPdf(result, translatedResult)} className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition">Exportar PDF (EN)</button>}
                    <button onClick={() => copyToClipboard(result)} className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 transition">Copiar para Docs</button>
                </div>
            </div>

            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Sinopsis Comercial</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{renderWithItalics(result.synopsis)}</p>
            </div>

            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Nota Biográfica del Autor</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{renderWithItalics(result.authorBio)}</p>
            </div>
            
            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Clasificación</h3>
                {renderClassification("BISAC", result.classifications.bisac)}
                {renderClassification("THEMA", result.classifications.thema)}
                {renderClassification("IBIC", result.classifications.ibic)}
            </div>

            <div className="border-t pt-4">
                 <h3 className="text-xl font-semibold mb-2 text-gray-800">Etiquetas y Datos</h3>
                 <p><span className="font-semibold">Etiquetas:</span> {result.tags.join(', ')}</p>
                 <p><span className="font-semibold">Conteo de palabras:</span> {result.wordCount.toLocaleString('es-ES')}</p>
            </div>

            <div className="border-t pt-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Cómo Citar</h3>
                <div className="space-y-1 text-sm">
                    <p><b>APA:</b> {renderWithItalics(result.citations.apa)}</p>
                    <p><b>MLA:</b> {renderWithItalics(result.citations.mla)}</p>
                    <p><b>Chicago:</b> {renderWithItalics(result.citations.chicago)}</p>
                    <p><b>Harvard:</b> {renderWithItalics(result.citations.harvard)}</p>
                    <p><b>Vancouver:</b> {renderWithItalics(result.citations.vancouver)}</p>
                </div>
            </div>

            {result.subtitleSuggestions && result.subtitleSuggestions.length > 0 && (
                 <div className="border-t pt-4">
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">Sugerencias de Subtítulo</h3>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 columns-2">
                        {result.subtitleSuggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};

interface CitationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CitationInfo) => void;
}

const CitationModal: FC<CitationModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [citationInfo, setCitationInfo] = useState<CitationInfo>({
        publisher: '',
        year: '',
        city: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCitationInfo(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(citationInfo);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">Completar Datos de Citación</h2>
                <p className="text-gray-600 mb-6">Hemos detectado que faltan algunos datos para generar las citas correctamente. Por favor, complétalos a continuación.</p>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="publisher" className="block text-sm font-medium text-gray-700">Sello Editorial</label>
                            <input
                                type="text"
                                name="publisher"
                                id="publisher"
                                value={citationInfo.publisher}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm"
                                placeholder="Ej: Ediciones El Lector"
                            />
                        </div>
                        <div>
                            <label htmlFor="year" className="block text-sm font-medium text-gray-700">Año de Publicación</label>
                            <input
                                type="text"
                                name="year"
                                id="year"
                                value={citationInfo.year}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm"
                                placeholder="Ej: 2023"
                            />
                        </div>
                        <div>
                            <label htmlFor="city" className="block text-sm font-medium text-gray-700">Ciudad de Publicación</label>
                            <input
                                type="text"
                                name="city"
                                id="city"
                                value={citationInfo.city}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm"
                                placeholder="Ej: Madrid"
                            />
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">
                            Cancelar
                        </button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                            Guardar y Actualizar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface TitleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (title: string) => void;
}

const TitleModal: FC<TitleModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [title, setTitle] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (title.trim()) {
            onSubmit(title.trim());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">Título no Encontrado</h2>
                <p className="text-gray-600 mb-6">No hemos podido identificar el título de la obra en el documento. Por favor, introdúcelo a continuación.</p>
                <form onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Título de la Obra</label>
                        <input
                            type="text"
                            name="title"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm"
                            placeholder="Introduce el título aquí"
                            required
                        />
                    </div>
                    <div className="mt-8 flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">
                            Cancelar
                        </button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                            Guardar Título
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export default function App() {
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
    const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);

    const handleFileUpload = useCallback(async (file: File) => {
        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);

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
    }, []);

    const handleUpdateCitations = async (info: CitationInfo) => {
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
    };

    const handleUpdateTitle = (newTitle: string) => {
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
    };


    return (
        <div className="min-h-screen font-sans text-gray-900">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
                    <h1 className="text-3xl font-bold leading-tight text-gray-900">
                        El Buen Editor
                    </h1>
                    <p className="text-md text-gray-600 mt-1">Asistente de fichas para el gestor</p>
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
                                    <ResultsDisplay result={analysisResult} />
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
        </div>
    );
}