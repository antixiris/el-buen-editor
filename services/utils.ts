import React from 'react';
import { jsPDF } from 'jspdf';
import { AnalysisResult, TranslatedResult, SubjectClassification } from '../types';

export const renderWithItalics = (text: string | null | undefined): React.ReactNode => {
    if (!text) return null;
    const parts = text.split(/(\*.*?\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('*') && part.endsWith('*')) {
            return React.createElement('i', { key: index }, part.substring(1, part.length - 1));
        }
        return part;
    });
};

declare const pdfjsLib: any;
declare const mammoth: any;

export const extractTextFromFile = async (file: File): Promise<string> => {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (!event.target?.result) return reject('Could not read file');
        try {
          const pdf = await pdfjsLib.getDocument(event.target.result).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(' ');
          }
          resolve(text);
        } catch (error) {
          reject('Error parsing PDF file.');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
     return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
         if (!event.target?.result) return reject('Could not read file');
        mammoth.extractRawText({ arrayBuffer: event.target.result })
          .then((result: any) => resolve(result.value))
          .catch((err: any) => reject('Error parsing DOCX file.'));
      };
      reader.readAsArrayBuffer(file);
    });
  } else {
    return Promise.reject('Unsupported file type. Please upload a PDF or DOCX.');
  }
};

export const exportToPdf = (result: AnalysisResult, translated?: TranslatedResult) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const baseFontSize = 10;
    const lineHeight = 5; // mm for font size 10

    const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    const printWrappedRichText = (text: string, x: number, maxWidth: number) => {
        const spaceWidth = doc.getTextWidth(' ');
        const parts = text.split(/(\*.*?\*)/g).filter(p => p);
        
        let wordsAndStyles: { word: string; isItalic: boolean }[] = [];
        parts.forEach(part => {
            const isItalic = part.startsWith('*') && part.endsWith('*');
            const content = isItalic ? part.substring(1, part.length - 1) : part;
            content.split(/(\s+)/).filter(w => w).forEach(word => {
                wordsAndStyles.push({ word, isItalic });
            });
        });

        checkPageBreak(lineHeight); 

        let currentX = x;
        wordsAndStyles.forEach(({ word, isItalic }) => {
            doc.setFont('helvetica', isItalic ? 'italic' : 'normal');
            const wordWidth = doc.getTextWidth(word);
            
            if (currentX > x && currentX + wordWidth > x + maxWidth && !/^\s+$/.test(word)) {
                y += lineHeight;
                currentX = x;
                checkPageBreak(lineHeight);
            }
            
            doc.text(word, currentX, y, { charSpace: 0 });
            currentX += wordWidth;
        });

        y += lineHeight;
    };
    
    const addSectionTitle = (text: string) => {
        checkPageBreak(15);
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(text, margin, y);
        y += 6;
        doc.setFontSize(baseFontSize);
        doc.setFont('helvetica', 'normal');
    };

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const titleText = (translated ? translated.title : result.title).replace(/\*/g, '');
    const titleLines = doc.splitTextToSize(titleText, maxWidth);
    checkPageBreak(titleLines.length * 8 + 5);
    doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
    y += titleLines.length * 8;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    const authorText = (translated ? translated.authorName : result.authorName).replace(/\*/g, '');
    checkPageBreak(10);
    doc.text(authorText, pageWidth / 2, y, { align: 'center' });
    y += 10;
    
    doc.setFontSize(baseFontSize);

    addSectionTitle(translated ? 'Synopsis' : 'Sinopsis');
    printWrappedRichText(translated ? translated.synopsis : result.synopsis, margin, maxWidth);

    addSectionTitle(translated ? "Author's Biography" : 'Nota biográfica del autor');
    printWrappedRichText(translated ? translated.authorBio : result.authorBio, margin, maxWidth);

    addSectionTitle(translated ? 'Data, Tags & Classification' : 'Datos, Etiquetas y Clasificación');

    doc.setFont('helvetica', 'bold');
    doc.text(translated ? 'Word count:' : 'Conteo de palabras:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(result.wordCount.toLocaleString(translated ? 'en-US' : 'es-ES'), margin + 40, y);
    y += lineHeight * 1.5;

    doc.setFont('helvetica', 'bold');
    doc.text(translated ? 'Tags:' : 'Etiquetas:', margin, y);
    y += lineHeight;
    doc.setFont('helvetica', 'normal');
    printWrappedRichText(result.tags.join(', '), margin, maxWidth);
    y += lineHeight;
    
    const renderClassification = (title: string, data: SubjectClassification) => {
        checkPageBreak(12);
        y += 6;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, y);
        y += 6;
        doc.setFontSize(baseFontSize);

        const renderItems = (sectionTitle: string, items: { code: string; description: string; justification: string }[]) => {
            if (!items || items.length === 0) return;
            
            checkPageBreak(7);
            doc.setFont('helvetica', 'bold');
            doc.text(sectionTitle, margin + 4, y);
            y += lineHeight;

            items.forEach(item => {
                const mainText = `${item.description} (${item.code})`;
                const justText = `${translated ? 'Justification' : 'Justificación'}: ${item.justification}`;
                
                const mainLines = doc.splitTextToSize(mainText, maxWidth - 12);
                const justLines = doc.splitTextToSize(justText, maxWidth - 12);
                
                checkPageBreak((mainLines.length + justLines.length) * lineHeight + 2);
                
                doc.setFont('helvetica', 'normal');
                doc.text(mainLines, margin + 8, y);
                y += mainLines.length * lineHeight;

                doc.setFont('helvetica', 'italic');
                doc.setTextColor(100, 100, 100);
                doc.text(justLines, margin + 8, y);
                y += justLines.length * lineHeight;

                y += lineHeight / 2;
                doc.setTextColor(0, 0, 0);
            });
        };
        
        const mainTitle = translated ? "Main" : "Principal";
        const secondaryTitle = translated ? "Secondary" : "Secundario";
        const relatedTitle = translated ? "Related" : "Relacionado";

        renderItems(mainTitle, data.main);
        renderItems(secondaryTitle, data.secondary);
        renderItems(relatedTitle, data.related);
    };

    renderClassification("BISAC", result.classifications.bisac);
    renderClassification("THEMA", result.classifications.thema);
    renderClassification("IBIC", result.classifications.ibic);

    addSectionTitle(translated ? 'How to Cite' : 'Cómo Citar');
    
    const citations = [
        { label: 'APA:', text: result.citations.apa },
        { label: 'MLA:', text: result.citations.mla },
        { label: 'Chicago:', text: result.citations.chicago },
        { label: 'Harvard:', text: result.citations.harvard },
        { label: 'Vancouver:', text: result.citations.vancouver },
    ];

    citations.forEach(citation => {
        checkPageBreak(lineHeight * 2);
        doc.setFont('helvetica', 'bold');
        doc.text(citation.label, margin, y);
        doc.setFont('helvetica', 'normal');
        printWrappedRichText(citation.text, margin + 20, maxWidth - 20);
        y += lineHeight / 2;
    });

    const fileName = translated ? `${result.title.replace(/[\/\?<>\\:\*\|":]/g, '_')}_en.pdf` : `${result.title.replace(/[\/\?<>\\:\*\|":]/g, '_')}.pdf`;
    doc.save(fileName);
};

export const copyToClipboard = (result: AnalysisResult) => {
    const formatItalics = (text: string) => text.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<i>$1</i>');

    const renderClassificationSection = (title: string, data: SubjectClassification) => {
        let sectionHtml = `<h4>${title}</h4>`;
        
        const renderItems = (sectionTitle: string, items: { code: string; description: string; justification: string }[]) => {
            if (!items || items.length === 0) return '';
            let itemsHtml = `<h5>${sectionTitle}</h5><ul>`;
            items.forEach(item => {
                itemsHtml += `<li>${item.description} (${item.code})<br><i>Justificación: ${item.justification}</i></li>`;
            });
            itemsHtml += `</ul>`;
            return itemsHtml;
        };
        
        sectionHtml += renderItems("Principal", data.main);
        sectionHtml += renderItems("Secundario", data.secondary);
        sectionHtml += renderItems("Relacionado", data.related);
        
        return sectionHtml;
    };

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; }
            h1 { font-size: 24px; font-weight: bold; }
            h2 { font-size: 18px; font-weight: normal; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 1em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            h4 { font-size: 14px; font-weight: bold; margin-top: 0.8em; }
            h5 { font-size: 12px; font-weight: bold; margin-top: 0.5em; margin-left: 1em; }
            p, li { font-size: 12px; }
            ul { margin-left: 2em; margin-top: 0.5em; }
            i { font-style: italic; color: #555; }
        </style>
        <h1>${result.title}</h1>
        <h2>${result.authorName}</h2>
        
        <h3>Sinopsis</h3>
        <p>${formatItalics(result.synopsis)}</p>
        
        <h3>Nota biográfica del autor</h3>
        <p>${formatItalics(result.authorBio)}</p>
        
        <h3>Datos Adicionales</h3>
        <p><b>Conteo de palabras:</b> ${result.wordCount.toLocaleString('es-ES')}</p>
        <p><b>Etiquetas:</b> ${result.tags.join(', ')}</p>

        <h3>Clasificación</h3>
        ${renderClassificationSection("BISAC", result.classifications.bisac)}
        ${renderClassificationSection("THEMA", result.classifications.thema)}
        ${renderClassificationSection("IBIC", result.classifications.ibic)}

        <h3>Citas</h3>
        <p><b>APA:</b> ${formatItalics(result.citations.apa)}</p>
        <p><b>MLA:</b> ${formatItalics(result.citations.mla)}</p>
        <p><b>Chicago:</b> ${formatItalics(result.citations.chicago)}</p>
        <p><b>Harvard:</b> ${formatItalics(result.citations.harvard)}</p>
        <p><b>Vancouver:</b> ${formatItalics(result.citations.vancouver)}</p>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Contenido copiado al portapapeles. Ahora puedes pegarlo en Google Docs.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('No se pudo copiar el contenido.');
    });
};

export const copyArticleToClipboard = (article: string, title: string, author: string) => {
    // Convertir markdown de cursivas a HTML
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Convertir saltos de línea a párrafos HTML
    const paragraphs = article
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${formatItalics(p.trim())}</p>`)
        .join('\n');

    const richText = `
        <style>
            body { font-family: Georgia, serif; line-height: 1.6; }
            h1 { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 16px; font-weight: normal; color: #555; margin-top: 0; }
            p { font-size: 14px; margin-bottom: 12px; text-align: justify; }
            i { font-style: italic; }
        </style>
        <h1>${title}</h1>
        <h2>Por ${author}</h2>
        <hr>
        ${paragraphs}
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Artículo copiado al portapapeles. Se abrirá Google Docs para que lo pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy article: ', err);
        alert('No se pudo copiar el artículo.');
    });
};

export const copyInterviewToClipboard = (
    introduction: string,
    questions: string[],
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Formatear la introducción en párrafos
    const introParagraphs = introduction
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${formatItalics(p.trim())}</p>`)
        .join('\n');

    // Formatear las preguntas (sin "N." para evitar autoformato de listas en Google Docs)
    const questionsList = questions
        .map((q, i) => `<p><b>Pregunta ${i + 1}:</b> ${formatItalics(q)}</p><p><i>[Respuesta del autor]</i></p><br>`)
        .join('\n');

    const richText = `
        <style>
            body { font-family: Georgia, serif; line-height: 1.6; }
            h1 { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 16px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 18px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; }
            p { font-size: 14px; margin-bottom: 12px; text-align: justify; }
            i { font-style: italic; }
            b { font-weight: bold; }
        </style>
        <h1>Entrevista a ${author}</h1>
        <h2>Con motivo de la publicación de <i>${title}</i></h2>
        <hr>
        <h3>Introducción</h3>
        ${introParagraphs}
        <h3>Preguntas</h3>
        ${questionsList}
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Entrevista copiada al portapapeles. Se abrirá Google Docs para que la pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy interview: ', err);
        alert('No se pudo copiar la entrevista.');
    });
};

export interface SocialMediaPosts {
    twitter: string;
    instagram: string;
    facebook: string;
    linkedin: string;
}

export const copySocialMediaToClipboard = (
    posts: SocialMediaPosts,
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
            p { font-size: 13px; margin-bottom: 10px; white-space: pre-wrap; }
            .platform { background-color: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
            i { font-style: italic; }
        </style>
        <h1>Posts para Redes Sociales</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <h3>🐦 Twitter/X</h3>
        <div class="platform">
            <p>${formatItalics(posts.twitter)}</p>
        </div>

        <h3>📸 Instagram</h3>
        <div class="platform">
            <p>${formatItalics(posts.instagram.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>👥 Facebook</h3>
        <div class="platform">
            <p>${formatItalics(posts.facebook.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>💼 LinkedIn</h3>
        <div class="platform">
            <p>${formatItalics(posts.linkedin.replace(/\n/g, '<br>'))}</p>
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Posts copiados al portapapeles. Se abrirá Google Docs para que los pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy social media posts: ', err);
        alert('No se pudo copiar los posts.');
    });
};

export interface SalesPitchResult {
    targetAudience: string;
    salesHooks: string[];
    differentiators: string[];
    objectionHandlers: string[];
    elevatorPitch: string;
}

export const copySalesPitchToClipboard = (
    pitch: SalesPitchResult,
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #333; }
            p { font-size: 13px; margin-bottom: 10px; }
            ul { margin-left: 20px; margin-top: 8px; }
            li { font-size: 13px; margin-bottom: 6px; }
            .section { background-color: #f9f9f9; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #4a90d9; }
            .elevator { background-color: #e8f4e8; padding: 16px; border-radius: 8px; font-size: 14px; font-style: italic; }
            i { font-style: italic; }
        </style>
        <h1>Argumentario de Ventas</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <h3>🎯 Público Objetivo</h3>
        <div class="section">
            <p>${formatItalics(pitch.targetAudience)}</p>
        </div>

        <h3>🪝 Ganchos de Venta</h3>
        <div class="section">
            <ul>
                ${pitch.salesHooks.map(hook => `<li>${formatItalics(hook)}</li>`).join('\n')}
            </ul>
        </div>

        <h3>⭐ Diferenciadores</h3>
        <div class="section">
            <ul>
                ${pitch.differentiators.map(diff => `<li>${formatItalics(diff)}</li>`).join('\n')}
            </ul>
        </div>

        <h3>🛡️ Manejo de Objeciones</h3>
        <div class="section">
            <ul>
                ${pitch.objectionHandlers.map(obj => `<li>${formatItalics(obj)}</li>`).join('\n')}
            </ul>
        </div>

        <h3>💬 Elevator Pitch (30 segundos)</h3>
        <div class="elevator">
            <p>${formatItalics(pitch.elevatorPitch)}</p>
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Argumentario copiado al portapapeles. Se abrirá Google Docs para que lo pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy sales pitch: ', err);
        alert('No se pudo copiar el argumentario.');
    });
};

export interface BookstoreEmailResult {
    subject: string;
    body: string;
}

export const copyBookstoreEmailToClipboard = (
    email: BookstoreEmailResult,
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Convertir saltos de línea a párrafos HTML
    const bodyParagraphs = email.body
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${formatItalics(p.trim().replace(/\n/g, '<br>'))}</p>`)
        .join('\n');

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 13px; font-weight: normal; color: #555; margin-top: 0; }
            .subject-label { font-size: 12px; color: #666; margin-top: 16px; }
            .subject { font-size: 15px; font-weight: bold; background-color: #f0f0f0; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
            .body { background-color: #fafafa; padding: 16px; border-radius: 8px; border: 1px solid #e0e0e0; }
            p { font-size: 13px; margin-bottom: 12px; }
            i { font-style: italic; }
        </style>
        <h1>Email a Libreros</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <p class="subject-label">Asunto:</p>
        <div class="subject">${formatItalics(email.subject)}</div>

        <p class="subject-label">Cuerpo del mensaje:</p>
        <div class="body">
            ${bodyParagraphs}
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Email copiado al portapapeles. Se abrirá Google Docs para que lo pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy bookstore email: ', err);
        alert('No se pudo copiar el email.');
    });
};

export interface ReadingReportResult {
    summary: string;
    literaryAnalysis: string;
    strengths: string[];
    weaknesses: string[];
    marketAnalysis: string;
    targetAudience: string;
    recommendation: 'PUBLICAR' | 'PUBLICAR_CON_CAMBIOS' | 'RECHAZAR';
    recommendationJustification: string;
}

export const copyReadingReportToClipboard = (
    report: ReadingReportResult,
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    const recommendationColors: Record<string, string> = {
        'PUBLICAR': '#2e7d32',
        'PUBLICAR_CON_CAMBIOS': '#f57c00',
        'RECHAZAR': '#c62828'
    };

    const recommendationLabels: Record<string, string> = {
        'PUBLICAR': '✅ PUBLICAR',
        'PUBLICAR_CON_CAMBIOS': '⚠️ PUBLICAR CON CAMBIOS',
        'RECHAZAR': '❌ RECHAZAR'
    };

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 24px; margin-bottom: 8px; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 4px; }
            p { font-size: 13px; margin-bottom: 12px; text-align: justify; }
            ul { margin-left: 20px; margin-top: 8px; }
            li { font-size: 13px; margin-bottom: 8px; }
            .section { background-color: #fafafa; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
            .recommendation { padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .recommendation-label { font-size: 18px; font-weight: bold; }
            i { font-style: italic; }
            .strength { color: #2e7d32; }
            .weakness { color: #c62828; }
        </style>
        <h1>Informe de Lectura</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <div class="recommendation" style="background-color: ${recommendationColors[report.recommendation]}20; border-left: 4px solid ${recommendationColors[report.recommendation]};">
            <span class="recommendation-label" style="color: ${recommendationColors[report.recommendation]};">
                ${recommendationLabels[report.recommendation]}
            </span>
        </div>

        <h3>📋 Resumen Ejecutivo</h3>
        <div class="section">
            <p>${formatItalics(report.summary.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>📖 Análisis Literario</h3>
        <div class="section">
            <p>${formatItalics(report.literaryAnalysis.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>✅ Puntos Fuertes</h3>
        <div class="section">
            <ul>
                ${report.strengths.map(s => `<li class="strength">${formatItalics(s)}</li>`).join('\n')}
            </ul>
        </div>

        <h3>⚠️ Áreas de Mejora</h3>
        <div class="section">
            <ul>
                ${report.weaknesses.map(w => `<li class="weakness">${formatItalics(w)}</li>`).join('\n')}
            </ul>
        </div>

        <h3>📊 Análisis de Mercado</h3>
        <div class="section">
            <p>${formatItalics(report.marketAnalysis.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>🎯 Público Objetivo</h3>
        <div class="section">
            <p>${formatItalics(report.targetAudience.replace(/\n/g, '<br>'))}</p>
        </div>

        <h3>📝 Justificación de la Recomendación</h3>
        <div class="section">
            <p>${formatItalics(report.recommendationJustification.replace(/\n/g, '<br>'))}</p>
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Informe de lectura copiado al portapapeles. Se abrirá Google Docs para que lo pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy reading report: ', err);
        alert('No se pudo copiar el informe de lectura.');
    });
};

export interface Comparable {
    title: string;
    author: string;
    publisher: string;
    year: number;
    reason: string;
    differentiator: string;
}

export interface ComparablesResult {
    comparables: Comparable[];
    marketPositioning: string;
}

export const copyComparablesToClipboard = (
    result: ComparablesResult,
    title: string,
    author: string
) => {
    const formatItalics = (text: string) => text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    const comparableRows = result.comparables.map((comp, i) => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${i + 1}. <i>${comp.title}</i></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${comp.author}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${comp.publisher}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${comp.year}</td>
        </tr>
        <tr>
            <td colspan="4" style="padding: 8px 8px 8px 24px; border-bottom: 2px solid #ddd; background-color: #fafafa;">
                <p style="margin: 4px 0; font-size: 12px;"><b>Por qué es comparable:</b> ${formatItalics(comp.reason)}</p>
                <p style="margin: 4px 0; font-size: 12px;"><b>Diferenciador:</b> ${formatItalics(comp.differentiator)}</p>
            </td>
        </tr>
    `).join('\n');

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; color: #333; }
            p { font-size: 13px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background-color: #4a90d9; color: white; padding: 10px; text-align: left; }
            .positioning { background-color: #e8f4e8; padding: 16px; border-radius: 8px; border-left: 4px solid #2e7d32; }
            i { font-style: italic; }
        </style>
        <h1>Libros Comparables</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <h3>📚 Títulos Comparables</h3>
        <table>
            <thead>
                <tr>
                    <th>Título</th>
                    <th>Autor</th>
                    <th>Editorial</th>
                    <th>Año</th>
                </tr>
            </thead>
            <tbody>
                ${comparableRows}
            </tbody>
        </table>

        <h3>🎯 Posicionamiento de Mercado</h3>
        <div class="positioning">
            <p>${formatItalics(result.marketPositioning.replace(/\n/g, '<br>'))}</p>
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Comparables copiados al portapapeles. Se abrirá Google Docs para que los pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy comparables: ', err);
        alert('No se pudo copiar los comparables.');
    });
};

export interface SeoKeywordsResult {
    primaryKeywords: string[];
    longTailKeywords: string[];
    thematicKeywords: string[];
    audienceKeywords: string[];
    amazonCategories: string[];
    metaDescription: string;
}

export const copySeoKeywordsToClipboard = (
    seo: SeoKeywordsResult,
    title: string,
    author: string
) => {
    const renderKeywordList = (keywords: string[]) =>
        keywords.map(kw => `<span style="display: inline-block; background-color: #e3f2fd; color: #1565c0; padding: 4px 8px; margin: 2px; border-radius: 4px; font-size: 12px;">${kw}</span>`).join(' ');

    const renderCategoryList = (categories: string[]) =>
        categories.map(cat => `<li style="margin-bottom: 4px;">${cat}</li>`).join('\n');

    const richText = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #555; margin-top: 0; }
            h3 { font-size: 15px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #333; }
            .section { background-color: #fafafa; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
            .meta-section { background-color: #fff3e0; padding: 12px; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 16px; }
            .amazon-section { background-color: #fff8e1; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
            ul { margin-left: 20px; margin-top: 8px; }
            p { font-size: 13px; margin-bottom: 8px; }
            .label { font-weight: bold; color: #666; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
        </style>
        <h1>Palabras Clave SEO</h1>
        <h2><i>${title}</i> de ${author}</h2>
        <hr>

        <h3>🔑 Keywords Principales</h3>
        <div class="section">
            ${renderKeywordList(seo.primaryKeywords)}
        </div>

        <h3>🎯 Keywords Long-Tail</h3>
        <div class="section">
            ${renderKeywordList(seo.longTailKeywords)}
        </div>

        <h3>📚 Keywords Temáticas</h3>
        <div class="section">
            ${renderKeywordList(seo.thematicKeywords)}
        </div>

        <h3>👥 Keywords de Audiencia</h3>
        <div class="section">
            ${renderKeywordList(seo.audienceKeywords)}
        </div>

        <h3>🛒 Categorías Amazon Sugeridas</h3>
        <div class="amazon-section">
            <ul>
                ${renderCategoryList(seo.amazonCategories)}
            </ul>
        </div>

        <h3>📝 Meta Descripción SEO</h3>
        <div class="meta-section">
            <p class="label">150-160 caracteres</p>
            <p style="font-style: italic;">"${seo.metaDescription}"</p>
            <p style="font-size: 11px; color: #666;">(${seo.metaDescription.length} caracteres)</p>
        </div>
    `;

    const blob = new Blob([richText], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    navigator.clipboard.write([clipboardItem]).then(() => {
        alert('Palabras clave SEO copiadas al portapapeles. Se abrirá Google Docs para que las pegues.');
        window.open('https://docs.google.com/document/create', '_blank');
    }).catch(err => {
        console.error('Failed to copy SEO keywords: ', err);
        alert('No se pudo copiar las palabras clave SEO.');
    });
};

/**
 * Genera y descarga un archivo ONIX 3.0 con los metadatos del libro.
 * ONIX es el estándar internacional para intercambio de información bibliográfica.
 */
export const exportToOnix = (result: AnalysisResult) => {
    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/\*/g, ''); // Remove markdown italics
    };

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // Generar identificador único basado en título y autor
    const recordRef = `EBE-${Date.now()}`;

    // Extraer nombre y apellido del autor (simplificado)
    const authorParts = result.authorName.split(' ');
    const authorFirstName = authorParts.slice(0, -1).join(' ') || authorParts[0];
    const authorLastName = authorParts[authorParts.length - 1] || '';

    // Construir subjects BISAC
    const bisacSubjects = [...result.classifications.bisac.main, ...result.classifications.bisac.secondary]
        .map(item => `
        <Subject>
            <SubjectSchemeIdentifier>10</SubjectSchemeIdentifier>
            <SubjectCode>${escapeXml(item.code)}</SubjectCode>
            <SubjectHeadingText>${escapeXml(item.description)}</SubjectHeadingText>
        </Subject>`).join('');

    // Construir subjects THEMA
    const themaSubjects = [...result.classifications.thema.main, ...result.classifications.thema.secondary]
        .map(item => `
        <Subject>
            <SubjectSchemeIdentifier>93</SubjectSchemeIdentifier>
            <SubjectCode>${escapeXml(item.code)}</SubjectCode>
            <SubjectHeadingText>${escapeXml(item.description)}</SubjectHeadingText>
        </Subject>`).join('');

    // Keywords
    const keywords = result.tags.map(tag => `
        <Subject>
            <SubjectSchemeIdentifier>20</SubjectSchemeIdentifier>
            <SubjectHeadingText>${escapeXml(tag)}</SubjectHeadingText>
        </Subject>`).join('');

    const onixXml = `<?xml version="1.0" encoding="UTF-8"?>
<ONIXMessage release="3.0" xmlns="http://ns.editeur.org/onix/3.0/reference">
    <Header>
        <Sender>
            <SenderName>El Buen Editor</SenderName>
            <ContactName>Departamento Editorial</ContactName>
            <EmailAddress>editorial@example.com</EmailAddress>
        </Sender>
        <SentDateTime>${today}</SentDateTime>
        <MessageNote>Metadatos generados automáticamente por El Buen Editor</MessageNote>
    </Header>
    <Product>
        <RecordReference>${recordRef}</RecordReference>
        <NotificationType>03</NotificationType>
        <RecordSourceType>01</RecordSourceType>
        <RecordSourceName>El Buen Editor</RecordSourceName>

        <!-- Identificadores del producto -->
        <ProductIdentifier>
            <ProductIDType>01</ProductIDType>
            <IDTypeName>Referencia interna</IDTypeName>
            <IDValue>${recordRef}</IDValue>
        </ProductIdentifier>
        <!-- ISBN: Reemplazar con ISBN real cuando esté disponible -->
        <ProductIdentifier>
            <ProductIDType>15</ProductIDType>
            <IDValue>[ISBN-13]</IDValue>
        </ProductIdentifier>

        <DescriptiveDetail>
            <!-- Forma del producto -->
            <ProductComposition>00</ProductComposition>
            <ProductForm>BA</ProductForm>
            <ProductFormDetail>B102</ProductFormDetail>

            <!-- Título -->
            <TitleDetail>
                <TitleType>01</TitleType>
                <TitleElement>
                    <TitleElementLevel>01</TitleElementLevel>
                    <TitleText>${escapeXml(result.title)}</TitleText>
                    ${result.foundSubtitle ? `<Subtitle>${escapeXml(result.foundSubtitle)}</Subtitle>` : ''}
                </TitleElement>
            </TitleDetail>

            <!-- Autor -->
            <Contributor>
                <SequenceNumber>1</SequenceNumber>
                <ContributorRole>A01</ContributorRole>
                <PersonName>${escapeXml(result.authorName)}</PersonName>
                <PersonNameInverted>${escapeXml(authorLastName)}, ${escapeXml(authorFirstName)}</PersonNameInverted>
                <NamesBeforeKey>${escapeXml(authorFirstName)}</NamesBeforeKey>
                <KeyNames>${escapeXml(authorLastName)}</KeyNames>
                <BiographicalNote>${escapeXml(result.authorBio)}</BiographicalNote>
            </Contributor>

            <!-- Idioma -->
            <Language>
                <LanguageRole>01</LanguageRole>
                <LanguageCode>spa</LanguageCode>
            </Language>

            <!-- Extensión -->
            <Extent>
                <ExtentType>10</ExtentType>
                <ExtentValue>${result.wordCount}</ExtentValue>
                <ExtentUnit>02</ExtentUnit>
            </Extent>

            <!-- Clasificación por materias -->
            ${bisacSubjects}
            ${themaSubjects}
            ${keywords}

        </DescriptiveDetail>

        <CollateralDetail>
            <!-- Sinopsis -->
            <TextContent>
                <TextType>03</TextType>
                <ContentAudience>00</ContentAudience>
                <Text textformat="05">${escapeXml(result.synopsis)}</Text>
            </TextContent>

            <!-- Biografía del autor -->
            <TextContent>
                <TextType>13</TextType>
                <ContentAudience>00</ContentAudience>
                <Text textformat="05">${escapeXml(result.authorBio)}</Text>
            </TextContent>
        </CollateralDetail>

        <PublishingDetail>
            <PublishingStatus>00</PublishingStatus>
            <!-- Reemplazar con datos reales de la editorial -->
            <Publisher>
                <PublishingRole>01</PublishingRole>
                <PublisherName>[Nombre de la Editorial]</PublisherName>
            </Publisher>
            <CityOfPublication>[Ciudad]</CityOfPublication>
            <CountryOfPublication>ES</CountryOfPublication>
            <PublishingDate>
                <PublishingDateRole>01</PublishingDateRole>
                <Date>[AAAAMMDD]</Date>
            </PublishingDate>
        </PublishingDetail>

        <ProductSupply>
            <Market>
                <Territory>
                    <CountriesIncluded>ES</CountriesIncluded>
                </Territory>
            </Market>
            <SupplyDetail>
                <Supplier>
                    <SupplierRole>01</SupplierRole>
                    <SupplierName>[Distribuidor]</SupplierName>
                </Supplier>
                <ProductAvailability>10</ProductAvailability>
                <Price>
                    <PriceType>02</PriceType>
                    <PriceAmount>[0.00]</PriceAmount>
                    <CurrencyCode>EUR</CurrencyCode>
                </Price>
            </SupplyDetail>
        </ProductSupply>
    </Product>
</ONIXMessage>`;

    // Crear y descargar el archivo
    const blob = new Blob([onixXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '_')}_ONIX.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('Archivo ONIX 3.0 descargado. Recuerda completar los campos marcados con [...] antes de usar.');
};