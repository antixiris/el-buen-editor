import React, { useState, useEffect, useCallback } from 'react';
import { getActivityLog, formatActivityDate, ActivityLogEntry } from '@/services/activityLog';

interface ActivityLogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ isOpen, onClose }) => {
    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadEntries = useCallback(async () => {
        setIsLoading(true);
        const data = await getActivityLog(50);
        setEntries(data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadEntries();
        }
    }, [isOpen, loadEntries]);

    // Cerrar con Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Historial de Análisis</h2>
                                <p className="text-sm text-gray-500">Libros analizados recientemente</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-500">
                                <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-indigo-600" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Cargando historial...
                            </div>
                        ) : entries.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                </div>
                                <p className="text-gray-500">No hay registros de análisis todavía.</p>
                                <p className="text-sm text-gray-400 mt-1">Los libros analizados aparecerán aquí.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm table-fixed">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="w-[40%] px-3 py-2.5 text-left font-medium text-gray-600">Título / Autor</th>
                                        <th className="w-[25%] px-3 py-2.5 text-left font-medium text-gray-600 hidden md:table-cell">Usuario</th>
                                        <th className="w-[15%] px-3 py-2.5 text-right font-medium text-gray-600 hidden sm:table-cell">Palabras</th>
                                        <th className="w-[20%] px-3 py-2.5 text-right font-medium text-gray-600">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {entries.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-gray-800 truncate" title={entry.title}>
                                                    {entry.title}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate" title={entry.authorName}>
                                                    {entry.authorName}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 hidden md:table-cell">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                                                        {entry.userName.charAt(0).toUpperCase()}
                                                    </span>
                                                    <span className="text-gray-600 text-xs truncate">
                                                        {entry.userName.split(' ')[0]}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-gray-500 text-xs hidden sm:table-cell">
                                                {entry.wordCount?.toLocaleString('es-ES') || '-'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                                                {formatActivityDate(entry.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer */}
                    {!isLoading && (
                        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                                {entries.length} {entries.length === 1 ? 'registro' : 'registros'}
                            </span>
                            <button
                                onClick={loadEntries}
                                className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-3 py-1.5 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Actualizar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
