import { jsPDF } from 'jspdf';
import { AnalysisResult, TranslatedResult, SubjectClassification } from '../types';

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