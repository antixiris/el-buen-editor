import React, { useState, useRef, useEffect } from 'react';
import { getArticle, getPressRelease, getInterview, getBackCoverText, getSocialMediaPosts, getSalesPitch, getBookstoreEmail, getReadingReport, getComparables, getSeoKeywords, publishToGhost } from '@/services/geminiService';
import { copyArticleToClipboard, copyInterviewToClipboard, copySocialMediaToClipboard, copySalesPitchToClipboard, copyBookstoreEmailToClipboard, copyReadingReportToClipboard, copyComparablesToClipboard, copySeoKeywordsToClipboard } from '@/services/utils';
import { AnalysisResult, CommercialData } from '@/types';

interface HeaderContentBarProps {
    result: AnalysisResult | null;
    commercialData?: CommercialData;
}

interface ContentItem {
    id: string;
    label: string;
    icon: string;
}

interface MenuCategory {
    id: string;
    label: string;
    icon: string;
    color: string;
    hoverColor: string;
    items: ContentItem[];
}

const menuCategories: MenuCategory[] = [
    {
        id: 'editorial',
        label: 'Editorial',
        icon: '📚',
        color: 'bg-violet-600',
        hoverColor: 'hover:bg-violet-700',
        items: [
            { id: 'reading-report', label: 'Informe de lectura', icon: '📋' },
            { id: 'backcover', label: 'Solapa', icon: '📖' },
            { id: 'comparables', label: 'Comparables', icon: '📊' },
        ]
    },
    {
        id: 'comunicacion',
        label: 'Comunicación',
        icon: '📣',
        color: 'bg-cyan-600',
        hoverColor: 'hover:bg-cyan-700',
        items: [
            { id: 'press-release', label: 'Comunicado de prensa', icon: '📰' },
            { id: 'article', label: 'Reseña', icon: '📝' },
            { id: 'ghost-blog', label: 'Publicar en Ghost', icon: '👻' },
            { id: 'interview', label: 'Entrevista', icon: '🎤' },
            { id: 'sales-pitch', label: 'Argumentario', icon: '🎯' },
            { id: 'bookstore-email', label: 'Email libreros', icon: '✉️' },
        ]
    },
    {
        id: 'rrss',
        label: 'RRSS',
        icon: '📱',
        color: 'bg-pink-600',
        hoverColor: 'hover:bg-pink-700',
        items: [
            { id: 'social-media', label: 'Publicaciones', icon: '📱' },
            { id: 'seo-keywords', label: 'Palabras clave SEO', icon: '🔍' },
        ]
    },
];

export const HeaderContentBar: React.FC<HeaderContentBarProps> = ({ result, commercialData }) => {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Cerrar menú al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!result) return null;

    const handleGenerate = async (itemId: string) => {
        setOpenMenu(null);
        setLoadingId(itemId);

        try {
            switch (itemId) {
                case 'article':
                    const article = await getArticle(result, commercialData);
                    copyArticleToClipboard(article, result.title, result.authorName);
                    break;
                case 'backcover':
                    const backCover = await getBackCoverText(result, commercialData);
                    copyArticleToClipboard(backCover, `Texto de solapa: ${result.title}`, result.authorName);
                    break;
                case 'interview':
                    const interview = await getInterview(result, commercialData);
                    copyInterviewToClipboard(interview.introduction, interview.questions, result.title, result.authorName);
                    break;
                case 'reading-report':
                    const report = await getReadingReport(result, commercialData);
                    copyReadingReportToClipboard(report, result.title, result.authorName);
                    break;
                case 'press-release':
                    const pressRelease = await getPressRelease(result, commercialData);
                    copyArticleToClipboard(pressRelease, `Comunicado: ${result.title}`, result.authorName);
                    break;
                case 'social-media':
                    const posts = await getSocialMediaPosts(result, commercialData);
                    copySocialMediaToClipboard(posts, result.title, result.authorName);
                    break;
                case 'seo-keywords':
                    const seoKeywords = await getSeoKeywords(result);
                    copySeoKeywordsToClipboard(seoKeywords, result.title, result.authorName);
                    break;
                case 'sales-pitch':
                    const pitch = await getSalesPitch(result, commercialData);
                    copySalesPitchToClipboard(pitch, result.title, result.authorName);
                    break;
                case 'bookstore-email':
                    const email = await getBookstoreEmail(result, commercialData);
                    copyBookstoreEmailToClipboard(email, result.title, result.authorName);
                    break;
                case 'comparables':
                    const comparables = await getComparables(result);
                    copyComparablesToClipboard(comparables, result.title, result.authorName);
                    break;
                case 'ghost-blog':
                    const ghostResult = await publishToGhost(result);
                    if (ghostResult.success) {
                        const openEditor = confirm(
                            `✅ Borrador creado en Ghost:\n\n"${ghostResult.title}"\n\n¿Quieres abrir el editor de Ghost para revisarlo?`
                        );
                        if (openEditor) {
                            window.open(ghostResult.postUrl, '_blank');
                        }
                    }
                    break;
            }
        } catch (err) {
            console.error(err);
            alert('Error al generar el contenido. Verifica que la función esté configurada.');
        } finally {
            setLoadingId(null);
        }
    };

    const toggleMenu = (menuId: string) => {
        setOpenMenu(openMenu === menuId ? null : menuId);
    };

    // Encontrar en qué categoría está el item cargando
    const getLoadingCategory = () => {
        if (!loadingId) return null;
        return menuCategories.find(cat => cat.items.some(item => item.id === loadingId))?.id;
    };

    const loadingCategory = getLoadingCategory();

    return (
        <div ref={menuRef} className="flex items-center gap-2 py-1 px-2">
            {menuCategories.map((category) => (
                <div key={category.id} className="relative">
                    <button
                        onClick={() => toggleMenu(category.id)}
                        disabled={loadingId !== null}
                        className={`
                            flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium
                            transition-all whitespace-nowrap
                            ${category.color} ${category.hoverColor}
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${loadingCategory === category.id ? 'animate-pulse' : ''}
                        `}
                    >
                        {loadingCategory === category.id ? (
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <span>{category.icon}</span>
                        )}
                        <span>{category.label}</span>
                        <svg className={`w-3 h-3 transition-transform ${openMenu === category.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {openMenu === category.id && (
                        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-50">
                            {category.items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleGenerate(item.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
