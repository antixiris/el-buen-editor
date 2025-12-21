import React, { FC, useState } from 'react';
import { CitationInfo } from '@/types';

interface CitationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CitationInfo) => void;
}

export const CitationModal: FC<CitationModalProps> = ({ isOpen, onClose, onSubmit }) => {
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
