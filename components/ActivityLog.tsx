import React, { useState, useEffect } from 'react';
import { getActivityLog, formatActivityDate, ActivityLogEntry } from '@/services/activityLog';

export const ActivityLog: React.FC = () => {
    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    const loadEntries = async () => {
        setIsLoading(true);
        const data = await getActivityLog(50);
        setEntries(data);
        setIsLoading(false);
    };

    useEffect(() => {
        if (isExpanded) {
            loadEntries();
        }
    }, [isExpanded]);

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Header colapsable */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-gray-700">Historial de Análisis</span>
                    {entries.length > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full">
                            {entries.length}
                        </span>
                    )}
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
                <div className="border-t">
                    {isLoading ? (
                        <div className="p-4 text-center text-gray-500">
                            <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-indigo-600" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Cargando historial...
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                            No hay registros de análisis todavía.
                        </div>
                    ) : (
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600">Título</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 hidden sm:table-cell">Autor</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 hidden md:table-cell">Usuario</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {entries.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-gray-800 truncate max-w-[200px]" title={entry.title}>
                                                    {entry.title}
                                                </div>
                                                <div className="text-xs text-gray-500 sm:hidden">
                                                    {entry.authorName}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">
                                                <div className="truncate max-w-[150px]" title={entry.authorName}>
                                                    {entry.authorName}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 hidden md:table-cell">
                                                <div className="flex items-center gap-1">
                                                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-medium">
                                                        {entry.userName.charAt(0)}
                                                    </span>
                                                    <span className="text-gray-600 truncate max-w-[100px]" title={entry.userEmail}>
                                                        {entry.userName.split(' ')[0]}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-500 text-xs whitespace-nowrap">
                                                {formatActivityDate(entry.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Botón de refrescar */}
                    {!isLoading && entries.length > 0 && (
                        <div className="px-3 py-2 border-t bg-gray-50">
                            <button
                                onClick={loadEntries}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Actualizar
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
