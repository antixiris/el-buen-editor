import React, { FC, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ContentModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: string;
    contentType: 'article' | 'html';
}

export const ContentModal: FC<ContentModalProps> = ({
    isOpen,
    onClose,
    title,
    content,
    contentType
}) => {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);

    if (!isOpen) return null;

    const handleCopyHtml = async () => {
        // Convertir markdown de cursivas a HTML
        const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

        // Convertir saltos de línea a párrafos HTML
        const paragraphs = content
            .split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => `<p>${formatItalics(p.trim())}</p>`)
            .join('\n');

        const richText = `
            <style>
                body { font-family: Georgia, serif; line-height: 1.6; }
                h1 { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
                p { font-size: 14px; margin-bottom: 12px; text-align: justify; }
                i { font-style: italic; }
            </style>
            <h1>${title}</h1>
            <hr>
            ${paragraphs}
        `;

        try {
            // Intentar copiar como HTML formateado
            const blob = new Blob([richText], { type: 'text/html' });
            const clipboardItem = new ClipboardItem({ 'text/html': blob });
            await navigator.clipboard.write([clipboardItem]);
            setCopied(true);
            setCopyError(false);
            setTimeout(() => setCopied(false), 3000);
        } catch (err) {
            console.warn('HTML clipboard failed, trying plain text:', err);
            // Fallback: copiar como texto plano
            try {
                await navigator.clipboard.writeText(content);
                setCopied(true);
                setCopyError(false);
                setTimeout(() => setCopied(false), 3000);
            } catch (err2) {
                console.error('All clipboard methods failed:', err2);
                setCopyError(true);
                setTimeout(() => setCopyError(false), 3000);
            }
        }
    };

    const handleOpenGoogleDocs = () => {
        window.open('https://docs.google.com/document/create', '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900 truncate pr-4">{title}</h2>
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
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                            components={{
                                em: ({ children }) => <i>{children}</i>,
                                p: ({ children }) => <p className="mb-3 text-gray-700 leading-relaxed">{children}</p>,
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <p className="text-sm text-gray-500">
                        {copied ? (
                            <span className="text-green-600 font-medium">Copiado al portapapeles</span>
                        ) : copyError ? (
                            <span className="text-red-600">Error al copiar. Selecciona el texto manualmente.</span>
                        ) : (
                            'Copia el contenido y pégalo en tu documento'
                        )}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleOpenGoogleDocs}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-1.182 13.091H6.273v-1.636h7.272v1.636zm3.182-4.091H6.273v-1.636h10.454v1.636zm0-4.091H6.273V10.09h10.454v1.546zM14.727 6V.477L20.977 6h-6.25z"/>
                            </svg>
                            Abrir Google Docs
                        </button>
                        <button
                            onClick={handleCopyHtml}
                            disabled={copied}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
                                copied
                                    ? 'bg-green-600'
                                    : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                        >
                            {copied ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Copiado
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Copiar
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
