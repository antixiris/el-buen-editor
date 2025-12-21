import React, { FC, useState } from 'react';

interface TitleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (title: string) => void;
}

export const TitleModal: FC<TitleModalProps> = ({ isOpen, onClose, onSubmit }) => {
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
