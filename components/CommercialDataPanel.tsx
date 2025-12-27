import React, { useState } from 'react';
import { CommercialData, BookFormat } from '@/types';

interface CommercialDataPanelProps {
    data: CommercialData;
    onChange: (data: CommercialData) => void;
}

const FORMAT_OPTIONS: { value: BookFormat; label: string }[] = [
    { value: 'paperback', label: 'Rústica' },
    { value: 'hardcover', label: 'Cartoné' },
    { value: 'ebook', label: 'eBook' },
    { value: 'audiobook', label: 'Audiolibro' },
];

const CURRENCY_OPTIONS = [
    { value: 'EUR', label: '€ EUR' },
    { value: 'USD', label: '$ USD' },
    { value: 'GBP', label: '£ GBP' },
    { value: 'MXN', label: '$ MXN' },
];

export const CommercialDataPanel: React.FC<CommercialDataPanelProps> = ({ data, onChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [coverPreviewError, setCoverPreviewError] = useState(false);
    const [authorPreviewError, setAuthorPreviewError] = useState(false);

    const updateField = <K extends keyof CommercialData>(field: K, value: CommercialData[K]) => {
        onChange({ ...data, [field]: value });
    };

    const handleCoverUrlChange = (url: string) => {
        setCoverPreviewError(false);
        updateField('coverImageUrl', url || undefined);
    };

    const handleAuthorUrlChange = (url: string) => {
        setAuthorPreviewError(false);
        updateField('authorPhotoUrl', url || undefined);
    };

    const filledFieldsCount = Object.values(data).filter(v => v !== undefined && v !== '').length;

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Header colapsable */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-xl">📦</span>
                    <div className="text-left">
                        <h2 className="text-lg font-semibold text-gray-900">Datos Comerciales</h2>
                        <p className="text-sm text-gray-500">
                            {filledFieldsCount > 0
                                ? `${filledFieldsCount} campo${filledFieldsCount > 1 ? 's' : ''} completado${filledFieldsCount > 1 ? 's' : ''}`
                                : 'Portada, precio, ISBN y más (opcional)'}
                        </p>
                    </div>
                </div>
                <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Contenido expandible */}
            {isExpanded && (
                <div className="px-6 pb-6 border-t border-gray-100">
                    {/* Sección: Imágenes */}
                    <div className="mt-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <span>📷</span> Imágenes
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Portada */}
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    URL de la portada
                                </label>
                                <input
                                    type="url"
                                    value={data.coverImageUrl || ''}
                                    onChange={(e) => handleCoverUrlChange(e.target.value)}
                                    placeholder="https://ejemplo.com/portada.jpg"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                {data.coverImageUrl && !coverPreviewError && (
                                    <div className="mt-2 relative">
                                        <img
                                            src={data.coverImageUrl}
                                            alt="Vista previa portada"
                                            className="h-32 w-auto rounded shadow-sm border"
                                            onError={() => setCoverPreviewError(true)}
                                        />
                                    </div>
                                )}
                                {coverPreviewError && (
                                    <p className="mt-1 text-xs text-red-500">No se pudo cargar la imagen</p>
                                )}
                            </div>

                            {/* Foto autor */}
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    URL de la foto del autor
                                </label>
                                <input
                                    type="url"
                                    value={data.authorPhotoUrl || ''}
                                    onChange={(e) => handleAuthorUrlChange(e.target.value)}
                                    placeholder="https://ejemplo.com/autor.jpg"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                {data.authorPhotoUrl && !authorPreviewError && (
                                    <div className="mt-2">
                                        <img
                                            src={data.authorPhotoUrl}
                                            alt="Vista previa autor"
                                            className="h-32 w-auto rounded-full shadow-sm border object-cover"
                                            onError={() => setAuthorPreviewError(true)}
                                        />
                                    </div>
                                )}
                                {authorPreviewError && (
                                    <p className="mt-1 text-xs text-red-500">No se pudo cargar la imagen</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sección: Datos editoriales */}
                    <div className="mt-6">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <span>🏢</span> Datos editoriales
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Editorial</label>
                                <input
                                    type="text"
                                    value={data.publisher || ''}
                                    onChange={(e) => updateField('publisher', e.target.value || undefined)}
                                    placeholder="Nombre de la editorial"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Fecha de publicación</label>
                                <input
                                    type="date"
                                    value={data.publicationDate || ''}
                                    onChange={(e) => updateField('publicationDate', e.target.value || undefined)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">ISBN</label>
                                <input
                                    type="text"
                                    value={data.isbn || ''}
                                    onChange={(e) => updateField('isbn', e.target.value || undefined)}
                                    placeholder="978-84-XXXXX-XX-X"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Precio</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={data.price || ''}
                                        onChange={(e) => updateField('price', e.target.value ? parseFloat(e.target.value) : undefined)}
                                        placeholder="19.90"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    <select
                                        value={data.currency || 'EUR'}
                                        onChange={(e) => updateField('currency', e.target.value as CommercialData['currency'])}
                                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    >
                                        {CURRENCY_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Páginas</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={data.pages || ''}
                                    onChange={(e) => updateField('pages', e.target.value ? parseInt(e.target.value) : undefined)}
                                    placeholder="320"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Formato</label>
                                <select
                                    value={data.format || ''}
                                    onChange={(e) => updateField('format', e.target.value as BookFormat || undefined)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                >
                                    <option value="">Seleccionar...</option>
                                    {FORMAT_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Colección</label>
                                <input
                                    type="text"
                                    value={data.collection || ''}
                                    onChange={(e) => updateField('collection', e.target.value || undefined)}
                                    placeholder="Nombre de la colección"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sección: Traducción (opcional) */}
                    <div className="mt-6">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <span>🌍</span> Traducción (si aplica)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Título original</label>
                                <input
                                    type="text"
                                    value={data.originalTitle || ''}
                                    onChange={(e) => updateField('originalTitle', e.target.value || undefined)}
                                    placeholder="Título en idioma original"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Traductor/a</label>
                                <input
                                    type="text"
                                    value={data.translator || ''}
                                    onChange={(e) => updateField('translator', e.target.value || undefined)}
                                    placeholder="Nombre del traductor"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Nota informativa */}
                    <div className="mt-6 p-3 bg-indigo-50 rounded-md">
                        <p className="text-xs text-indigo-700">
                            <strong>💡 Tip:</strong> Estos datos se utilizarán automáticamente en los materiales generados
                            (emails a librerías, comunicados de prensa, etc.) para crear contenido más profesional y completo.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
