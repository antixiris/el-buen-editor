// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import cors from "cors";
import {GoogleGenAI, Type} from "@google/genai";
import {defineSecret} from "firebase-functions/params";

import {MATERIAS_BISAC} from "./data/materiasBisac";
import {MATERIAS_THEMA} from "./data/materiasThema";
import {MATERIAS_IBIC} from "./data/materiasIbic";
import {ETIQUETAS} from "./data/etiquetas";
import {AnalysisResult, TranslatedResult} from "./types";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const corsHandler = cors({origin: true});

const classificationItemSchema = {
  type: Type.OBJECT,
  properties: {
    code: {type: Type.STRING},
    description: {type: Type.STRING},
    justification: {type: Type.STRING},
  },
  required: ["code", "description", "justification"],
};

const subjectClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    main: {type: Type.ARRAY, items: classificationItemSchema},
    secondary: {type: Type.ARRAY, items: classificationItemSchema},
    related: {type: Type.ARRAY, items: classificationItemSchema},
  },
  required: ["main", "secondary", "related"],
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    title: {type: Type.STRING, description: "Título de la obra."},
    foundSubtitle: {
      type: Type.STRING,
      nullable: true,
      description: "Subtítulo encontrado en el texto, o null si no existe.",
    },
    subtitleSuggestions: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 20 subtítulos sugeridos si no se encuentra uno.",
    },
    authorName: {type: Type.STRING, description: "Nombre completo del autor."},
    authorBio: {
      type: Type.STRING,
      description: "Biografía del autor de 150 palabras.",
    },
    synopsis: {
      type: Type.STRING,
      description: "Sinopsis comercial de la obra.",
    },
    tags: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 4 a 6 etiquetas relevantes.",
    },
    classifications: {
      type: Type.OBJECT,
      properties: {
        bisac: subjectClassificationSchema,
        thema: subjectClassificationSchema,
        ibic: subjectClassificationSchema,
      },
      required: ["bisac", "thema", "ibic"],
    },
    citations: {
      type: Type.OBJECT,
      properties: {
        apa: {type: Type.STRING},
        mla: {type: Type.STRING},
        chicago: {type: Type.STRING},
        harvard: {type: Type.STRING},
        vancouver: {type: Type.STRING},
      },
      required: ["apa", "mla", "chicago", "harvard", "vancouver"],
    },
  },
  required: [
    "title",
    "foundSubtitle",
    "subtitleSuggestions",
    "authorName",
    "authorBio",
    "synopsis",
    "tags",
    "classifications",
    "citations",
  ],
};

const translationSchema = {
  type: Type.OBJECT,
  properties: {
    title: {type: Type.STRING},
    authorName: {type: Type.STRING},
    synopsis: {type: Type.STRING},
    authorBio: {type: Type.STRING},
  },
  required: ["title", "authorName", "synopsis", "authorBio"],
};

export const getEditorialAnalysis = onRequest({secrets: [geminiApiKey]}, (request, response) => {
  corsHandler(request, response, async () => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const {text, wordCount} = request.body;
      if (!text || typeof wordCount !== "number") {
        response
          .status(400)
          .send("Bad Request: Se requiere 'text' y 'wordCount'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      const materiasBisacList = MATERIAS_BISAC
        .map((m) => `${m.code}: ${m.description}`).join("\n");
      const materiasThemaList = MATERIAS_THEMA
        .map((m) => `${m.code}: ${m.description}`).join("\n");
      const materiasIbicList = MATERIAS_IBIC
        .map((m) => `${m.code}: ${m.description}`).join("\n");

      const prompt = `
Actúa como un experto editor y especialista en marketing editorial.
Analiza el siguiente texto de un manuscrito y extrae la siguiente
información estrictamente en el formato JSON especificado.

MANUSCRITO:
---
${text.substring(0, 100000)}
---

INSTRUCCIONES DETALLADAS:
1.  **title**: Extrae el título principal de la obra. Si no puedes
    identificar un título claro, devuelve "TÍTULO NO ENCONCONTRADO".
2.  **foundSubtitle**: Extrae el subtítulo si existe textualmente en la
    obra. Si no existe, devuelve null.
3.  **subtitleSuggestions**: Si no se encuentra un subtítulo, genera una
    lista de 20 sugerencias persuasivas. Si se encuentra, devuelve [].
4.  **authorName**: Extrae el nombre del autor. Si no se encuentra,
    devuelve "Autor Desconocido".
5.  **authorBio**: Genera una biografía del autor de 150 palabras.
    El tono debe ser serio y seductor, sin adjetivos calificativos.
    Usa markdown para cursivas en títulos de obras (ej: *El Quijote*).
    Si no hay info, devuelve "Sin información disponible del autor".
6.  **synopsis**: Redacta una sinopsis comercial de 230-280 palabras.
    Debe ser audaz, inteligente y evocadora. **Restricciones OBLIGATORIAS**:
    *   NO usar verbos en imperativo (ej: 'descubra').
    *   NO usar la construcción "... no [A], sino [B]...".
    *   NO usar adjetivos cliché (ej: 'fascinante').
    *   Usa markdown para cursivas en títulos de obras (ej: *El Quijote*).
7.  **tags**: De la lista de ETIQUETAS, selecciona entre 4 y 6 que mejor
    identifiquen la obra.
8.  **classifications**: Para cada sistema (bisac, thema, ibic),
    proporciona 2 materias principales, 2 secundarias y 2 relacionadas,
    con su código, descripción y una breve justificación en español.
9.  **citations**: Genera citas en APA, MLA, Chicago, Harvard y
    Vancouver. Usa placeholders ('[Editorial]', '[Año]', '[Ciudad]') si
    faltan datos. Usa markdown para cursivas en títulos.

LISTADOS PARA CLASIFICACIÓN:
---
ETIQUETAS:
${ETIQUETAS.join(", ")}
---
MATERIAS BISAC:
${materiasBisacList}
---
MATERIAS THEMA:
${materiasThemaList}
---
MATERIAS IBIC:
${materiasIbicList}
---
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API de Gemini está vacía.");
      }

      const resultJson = JSON.parse(geminiResponse.text);
      const analysisResult: AnalysisResult = {
        ...resultJson,
        wordCount,
        rawText: text,
      };

      response.status(200).json(analysisResult);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo procesar el documento.";
      console.error("Error llamando a la API de Gemini:", error);
      response.status(500).send(errorMessage);
    }
  });
});

export const getTranslation = onRequest({secrets: [geminiApiKey]}, (request, response) => {
  corsHandler(request, response, async () => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const data = request.body.data as AnalysisResult;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      const prompt = `
Translate only the values of the following JSON object from Spanish to English.
Maintain the exact same JSON structure and keys. The markdown for italics
(*text*) must be preserved in the translated output.

Input JSON:
${JSON.stringify({
    title: data.title,
    authorName: data.authorName,
    synopsis: data.synopsis,
    authorBio: data.authorBio,
  })}
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: translationSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API de traducción de Gemini está vacía.");
      }

      const translatedResult = JSON.parse(geminiResponse.text);
      response.status(200).json(translatedResult as TranslatedResult);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo traducir el contenido.";
      console.error("Error llamando a la API de traducción:", error);
      response.status(500).send(errorMessage);
    }
  });
});
