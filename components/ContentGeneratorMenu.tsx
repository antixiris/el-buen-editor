import React, { FC, useState, useRef, useEffect } from 'react';

export interface GeneratorOption {
    id: string;
    label: string;
    icon: string;
    description: string;
    isLoading: boolean;
    onClick: () => void;
}

export interface GeneratorCategory {
    name: string;
    icon: string;
    color: string;
    options: GeneratorOption[];
}

interface ContentGeneratorMenuProps {
    categories: GeneratorCategory[];
}

export const ContentGeneratorMenu: FC<ContentGeneratorMenuProps> = ({ categories }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Cerrar menú al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setActiveCategory(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cerrar menú con Escape
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                setActiveCategory(null);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleOptionClick = (option: GeneratorOption) => {
        option.onClick();
        setIsOpen(false);
        setActiveCategory(null);
    };

    const anyLoading = categories.some(cat => cat.options.some(opt => opt.isLoading));

    return (
        <div className="relative" ref={menuRef}>
            {/* Botón principal */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={anyLoading}
                className={`
                    px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm
                    flex items-center gap-2
                    ${anyLoading
                        ? 'bg-amber-500 text-white cursor-wait'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                    }
                `}
            >
                {anyLoading ? (
                    <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generando...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Generar Contenido
                        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </>
                )}
            </button>

            {/* Menú desplegable */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                    {/* Categorías */}
                    <div className="divide-y divide-gray-100">
                        {categories.map((category) => (
                            <div key={category.name}>
                                {/* Encabezado de categoría */}
                                <button
                                    onClick={() => setActiveCategory(activeCategory === category.name ? null : category.name)}
                                    className={`
                                        w-full px-4 py-3 flex items-center justify-between
                                        hover:bg-gray-50 transition-colors
                                        ${activeCategory === category.name ? 'bg-gray-50' : ''}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${category.color}`}>
                                            {category.icon}
                                        </span>
                                        <span className="font-medium text-gray-800">{category.name}</span>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-gray-400 transition-transform ${activeCategory === category.name ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Opciones de la categoría */}
                                {activeCategory === category.name && (
                                    <div className="bg-gray-50 px-2 py-2">
                                        {category.options.map((option) => (
                                            <button
                                                key={option.id}
                                                onClick={() => handleOptionClick(option)}
                                                disabled={option.isLoading}
                                                className={`
                                                    w-full px-3 py-2 rounded-lg text-left
                                                    flex items-center gap-3 group
                                                    transition-all
                                                    ${option.isLoading
                                                        ? 'bg-amber-100 cursor-wait'
                                                        : 'hover:bg-white hover:shadow-sm'
                                                    }
                                                `}
                                            >
                                                <span className="text-lg">{option.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-800 flex items-center gap-2">
                                                        {option.label}
                                                        {option.isLoading && (
                                                            <svg className="animate-spin w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">{option.description}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
