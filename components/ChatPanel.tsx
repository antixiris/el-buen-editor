import React, { useState, useRef, useEffect } from 'react';
import { chatWithAgent, ChatMessage } from '@/services/geminiService';
import { AnalysisResult, CommercialData } from '@/types';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
    bookAnalysis: AnalysisResult;
    commercialData?: CommercialData;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ bookAnalysis, commercialData }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Mensaje inicial del agente
    useEffect(() => {
        if (bookAnalysis && messages.length === 0) {
            const initialMessage: ChatMessage = {
                role: 'assistant',
                content: `He analizado **"${bookAnalysis.title}"** de **${bookAnalysis.authorName}**.

¿Qué necesitas que genere? Puedo ayudarte con:

- 📝 **Sinopsis** en formato largo, medio o corto
- 📊 **Argumentario** para equipos de venta
- 🎯 **Claims** y titulares de campaña
- 👥 **Segmentación** de público objetivo
- 🌍 **Materiales B2B** para distribuidores internacionales
- 📱 **Posts** para redes sociales
- 📰 **Comunicados** de prensa

Escribe lo que necesitas o pregúntame algo sobre el libro.`
            };
            setMessages([initialMessage]);
        }
    }, [bookAnalysis]);

    // Auto-scroll al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus en el input cuando se expande
    useEffect(() => {
        if (isExpanded) {
            inputRef.current?.focus();
        }
    }, [isExpanded]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: inputValue.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Filtrar el mensaje inicial del asistente del historial enviado al backend
            const historyForBackend = messages.filter((_, index) => index > 0);

            const response = await chatWithAgent(
                bookAnalysis,
                historyForBackend,
                userMessage.content,
                commercialData
            );

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.response
            };

            setMessages(prev => [...prev, assistantMessage]);
            setTotalTokens(prev => ({
                input: prev.input + response.tokensUsed.input,
                output: prev.output + response.tokensUsed.output
            }));
        } catch (error) {
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: '❌ Lo siento, ha ocurrido un error al procesar tu mensaje. Por favor, inténtalo de nuevo.'
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg transition-all hover:scale-105 z-50"
                title="Abrir chat con MarketingEditor"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-[480px] h-[600px] bg-white rounded-xl shadow-2xl flex flex-col z-50 border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white rounded-t-xl">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <div>
                        <h3 className="font-semibold text-sm">MarketingEditor</h3>
                        <p className="text-xs text-indigo-200">Agente de marketing editorial</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-indigo-200" title="Tokens utilizados">
                        {totalTokens.input + totalTokens.output > 0 &&
                            `${((totalTokens.input + totalTokens.output) / 1000).toFixed(1)}k tokens`
                        }
                    </span>
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1 hover:bg-indigo-700 rounded transition-colors"
                        title="Minimizar"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-lg px-4 py-2 ${
                                message.role === 'user'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-gray-200 shadow-sm'
                            }`}
                        >
                            {message.role === 'assistant' ? (
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                                            li: ({ children }) => <li className="mb-1">{children}</li>,
                                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                            h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                                            h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                                            h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                                            code: ({ children }) => (
                                                <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">{children}</code>
                                            ),
                                            pre: ({ children }) => (
                                                <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm my-2">{children}</pre>
                                            ),
                                        }}
                                    >
                                        {message.content}
                                    </ReactMarkdown>
                                    {index > 0 && (
                                        <button
                                            onClick={() => copyToClipboard(message.content)}
                                            className="mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                                            title="Copiar al portapapeles"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copiar
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                                <span className="text-sm text-gray-500">Generando...</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white rounded-b-xl">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Escribe tu mensaje..."
                        disabled={isLoading}
                        rows={2}
                        className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !inputValue.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    Shift+Enter para nueva línea • Enter para enviar
                </p>
            </div>
        </div>
    );
};
