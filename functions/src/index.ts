// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {GoogleGenAI, Type} from "@google/genai";
import {defineSecret} from "firebase-functions/params";

import {MATERIAS_BISAC} from "./data/materiasBisac";
import {MATERIAS_THEMA} from "./data/materiasThema";
import {MATERIAS_IBIC} from "./data/materiasIbic";
import {ETIQUETAS} from "./data/etiquetas";
import {AnalysisResult, TranslatedResult, SubjectClassification} from "./types";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Conjuntos para validación rápida O(1)
const VALID_ETIQUETAS = new Set(ETIQUETAS);
const VALID_BISAC_CODES = new Set(MATERIAS_BISAC.map((m) => m.code));
const VALID_THEMA_CODES = new Set(MATERIAS_THEMA.map((m) => m.code));
const VALID_IBIC_CODES = new Set(MATERIAS_IBIC.map((m) => m.code));

// Mapas para obtener descripciones oficiales
const BISAC_MAP = new Map(MATERIAS_BISAC.map((m) => [m.code, m.description]));
const THEMA_MAP = new Map(MATERIAS_THEMA.map((m) => [m.code, m.description]));
const IBIC_MAP = new Map(MATERIAS_IBIC.map((m) => [m.code, m.description]));

interface ValidationResult {
  isValid: boolean;
  invalidTags: string[];
  invalidBisac: string[];
  invalidThema: string[];
  invalidIbic: string[];
}

/**
 * Detecta etiquetas y códigos inválidos sin modificar el resultado.
 * @param {Omit<AnalysisResult, "wordCount" | "rawText">} result - Resultado del análisis a validar.
 * @return {ValidationResult} Objeto con indicador de validez y listas de códigos inválidos.
 */
function detectInvalidCodes(
  result: Omit<AnalysisResult, "wordCount" | "rawText">
): ValidationResult {
  const invalidTags = result.tags.filter((tag) => !VALID_ETIQUETAS.has(tag));

  const getInvalidCodes = (
    classification: SubjectClassification,
    validCodes: Set<string>
  ): string[] => {
    const allItems = [
      ...classification.main,
      ...classification.secondary,
      ...classification.related,
    ];
    return allItems
      .filter((item) => !validCodes.has(item.code))
      .map((item) => item.code);
  };

  const invalidBisac = getInvalidCodes(
    result.classifications.bisac,
    VALID_BISAC_CODES
  );
  const invalidThema = getInvalidCodes(
    result.classifications.thema,
    VALID_THEMA_CODES
  );
  const invalidIbic = getInvalidCodes(
    result.classifications.ibic,
    VALID_IBIC_CODES
  );

  const isValid =
    invalidTags.length === 0 &&
    invalidBisac.length === 0 &&
    invalidThema.length === 0 &&
    invalidIbic.length === 0;

  return {isValid, invalidTags, invalidBisac, invalidThema, invalidIbic};
}

/**
 * Valida y corrige descripciones de clasificaciones válidas.
 * @param {Array} items - Items de clasificación a normalizar.
 * @param {Set} validCodes - Conjunto de códigos válidos.
 * @param {Map} codeMap - Mapa de código a descripción oficial.
 * @return {Array} Items normalizados con descripciones oficiales.
 */
function normalizeClassificationItems(
  items: {code: string; description: string; justification: string}[],
  validCodes: Set<string>,
  codeMap: Map<string, string>
): {code: string; description: string; justification: string}[] {
  return items
    .filter((item) => validCodes.has(item.code))
    .map((item) => ({
      ...item,
      description: codeMap.get(item.code) || item.description,
    }));
}

/**
 * Normaliza clasificaciones (usa descripciones oficiales).
 * @param {Object} classifications - Objeto de clasificaciones a normalizar.
 * @return {Object} Clasificaciones con descripciones oficiales.
 */
function normalizeClassifications(
  classifications: AnalysisResult["classifications"]
): AnalysisResult["classifications"] {
  const normalizeSubject = (
    subject: SubjectClassification,
    validCodes: Set<string>,
    codeMap: Map<string, string>
  ): SubjectClassification => ({
    main: normalizeClassificationItems(subject.main, validCodes, codeMap),
    secondary: normalizeClassificationItems(
      subject.secondary, validCodes, codeMap
    ),
    related: normalizeClassificationItems(subject.related, validCodes, codeMap),
  });

  return {
    bisac: normalizeSubject(
      classifications.bisac, VALID_BISAC_CODES, BISAC_MAP
    ),
    thema: normalizeSubject(
      classifications.thema, VALID_THEMA_CODES, THEMA_MAP
    ),
    ibic: normalizeSubject(classifications.ibic, VALID_IBIC_CODES, IBIC_MAP),
  };
}

/**
 * Genera un prompt de corrección con los códigos rechazados.
 * @param {ValidationResult} validation - Resultado de la validación con códigos inválidos.
 * @return {string} Prompt de corrección para reintentar la generación.
 */
function buildCorrectionPrompt(validation: ValidationResult): string {
  const parts: string[] = [
    "\n\n# ⚠️ CORRECCIÓN REQUERIDA - CÓDIGOS RECHAZADOS\n",
    "Tu respuesta anterior contenía códigos INVÁLIDOS que NO existen en los " +
    "listados oficiales. Debes reemplazarlos por códigos que SÍ existan.\n",
  ];

  if (validation.invalidTags.length > 0) {
    parts.push(
      `\n**Etiquetas rechazadas** (NO existen): ${validation.invalidTags.join(", ")}\n` +
      "→ Reemplázalas por etiquetas de la LISTA CERRADA proporcionada.\n"
    );
  }

  if (validation.invalidBisac.length > 0) {
    parts.push(
      `\n**Códigos BISAC rechazados** (NO existen): ${validation.invalidBisac.join(", ")}\n` +
      "→ Usa SOLO códigos del LISTADO COMPLETO DE MATERIAS BISAC.\n"
    );
  }

  if (validation.invalidThema.length > 0) {
    parts.push(
      `\n**Códigos THEMA rechazados** (NO existen): ${validation.invalidThema.join(", ")}\n` +
      "→ Usa SOLO códigos del LISTADO COMPLETO DE MATERIAS THEMA.\n"
    );
  }

  if (validation.invalidIbic.length > 0) {
    parts.push(
      `\n**Códigos IBIC rechazados** (NO existen): ${validation.invalidIbic.join(", ")}\n` +
      "→ Usa SOLO códigos del LISTADO COMPLETO DE MATERIAS IBIC.\n"
    );
  }

  parts.push(
    "\n**IMPORTANTE**: Revisa los listados proporcionados y selecciona " +
    "ÚNICAMENTE códigos que aparezcan textualmente en ellos.\n"
  );

  return parts.join("");
}


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
      description: "Biografía del autor de 150 palabras, investigada en internet, incluyendo carrera, nacimiento, formación y obras.",
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

export const getEditorialAnalysis = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
      const MAX_RETRIES = 3;

      const materiasBisacList = MATERIAS_BISAC
        .map((m) => `${m.code}: ${m.description}`).join("\n");
      const materiasThemaList = MATERIAS_THEMA
        .map((m) => `${m.code}: ${m.description}`).join("\n");
      const materiasIbicList = MATERIAS_IBIC
        .map((m) => `${m.code}: ${m.description}`).join("\n");

      const basePrompt = `
# ROL Y CONTEXTO

Eres un editor literario senior con 25 años de experiencia en el sector editorial español, especializado en la catalogación y comercialización de obras literarias. Tu trabajo consiste en analizar manuscritos para generar fichas editoriales precisas y comercialmente efectivas.

Trabajas para una editorial de prestigio y tu análisis será utilizado por el equipo comercial, el departamento de marketing y los distribuidores. La precisión y el rigor son fundamentales.

---

# MANUSCRITO A ANALIZAR

${text.substring(0, 100000)}

---

# INSTRUCCIONES DE ANÁLISIS

## 1. TÍTULO (title)

Extrae el título principal de la obra siguiendo estas reglas:
- Busca en las primeras páginas: portada, portadilla, página de créditos.
- Si el título está en otro idioma, mantenlo en el idioma original.
- Si hay título y subtítulo separados por ":" o ".", extrae solo el título principal.
- Si no puedes identificar un título claro tras analizar el documento completo, devuelve exactamente: "TÍTULO NO ENCONTRADO".

## 2. SUBTÍTULO (foundSubtitle / subtitleSuggestions)

- **foundSubtitle**: Extrae el subtítulo SOLO si aparece explícitamente en el manuscrito (portada, portadilla). Si no existe, devuelve null.
- **subtitleSuggestions**: Si no se encontró subtítulo, genera 20 propuestas que:
  - Complementen el título sin repetir palabras del mismo.
  - Mezclen estilos: descriptivos, evocadores, con gancho comercial.
  - Sean concisos (máximo 8 palabras cada uno).
  - Si se encontró subtítulo, devuelve array vacío [].

## 3. AUTOR (authorName)

Extrae el nombre del autor aplicando estas reglas:
- Busca en portada, portadilla, página de créditos, colofón.
- Si aparece un pseudónimo conocido, usa el pseudónimo.
- Si hay múltiples autores, sepáralos con " y " (ej: "Ana García y Pedro López").
- Formato preferido: "Nombre Apellido1 Apellido2" (orden natural en español).
- Si no se encuentra autor, devuelve: "Autor Desconocido".

## 4. BIOGRAFÍA DEL AUTOR (authorBio)

Realiza una búsqueda exhaustiva en internet sobre el autor identificado. Genera una nota biográfica de 140-160 palabras siguiendo estas directrices:

**Contenido obligatorio (si está disponible):**
- Año y lugar de nacimiento (ciudad, país).
- Formación académica relevante.
- Trayectoria profesional/literaria destacada.
- Obras publicadas más significativas (en cursiva: *Título*).
- Premios o reconocimientos importantes.
- Temáticas o estilo característico.

**Estilo:**
- Tono: serio, informativo, sin halagos vacíos.
- Redacción en tercera persona.
- Prohibido: adjetivos valorativos ("brillante", "extraordinario", "magistral").
- Prohibido: construcciones "no es [A], sino [B]" / "no solo [A], también [B]".
- Usa cursivas markdown para títulos de obras: *Título de la obra*.

**Validación crítica:**
- Si el nombre es común, verifica que los datos correspondan al autor correcto mediante obras publicadas.
- Si encuentras información contradictoria, prioriza fuentes editoriales oficiales.
- Si no encuentras información fiable o hay riesgo de confusión con homónimos, devuelve: "No se ha encontrado información biográfica verificable del autor. Se recomienda solicitar nota biográfica directamente al autor."

## 5. SINOPSIS COMERCIAL (synopsis)

Redacta una sinopsis de 230-280 palabras siguiendo esta estructura:

**Estructura recomendada:**
1. **Gancho inicial** (1-2 frases): Situación, conflicto o pregunta que atrape.
2. **Desarrollo** (cuerpo): Premisa, personajes principales, contexto.
3. **Tensión/Promesa** (cierre): Qué está en juego, sin revelar el desenlace.

**RESTRICCIONES OBLIGATORIAS - Verificar antes de entregar:**
- ❌ NO usar verbos en imperativo: "descubra", "adéntrese", "sumérjase", "acompañe".
- ❌ NO usar la construcción: "no es [A], sino [B]" / "no solo [A], también [B]".
- ❌ NO usar adjetivos cliché: "fascinante", "apasionante", "inolvidable", "extraordinario", "imprescindible", "magistral", "brillante".
- ❌ NO usar frases hechas: "un viaje", "una historia que", "en un mundo donde".
- ❌ NO revelar el final ni giros argumentales clave.
- ✅ SÍ usar cursivas markdown para títulos mencionados: *Título*.
- ✅ SÍ adaptar el tono al género (thriller: tensión; romance: emoción; ensayo: rigor).

**Diferenciación por género:**
- **Narrativa/Ficción**: Enfócate en personajes, conflicto, atmósfera.
- **Ensayo/No ficción**: Enfócate en tesis, relevancia, aportación al campo.
- **Poesía**: Enfócate en voz poética, temas, tradición en la que se inscribe.

## 6. ETIQUETAS (tags)

⚠️ **RESTRICCIÓN CRÍTICA**: Solo puedes usar etiquetas que aparezcan EXACTAMENTE en la lista siguiente. NO inventes etiquetas nuevas. Si una etiqueta no está en la lista, NO la uses aunque parezca apropiada.

Selecciona entre 4 y 6 etiquetas de la lista proporcionada que:
- Representen los temas CENTRALES de la obra (no secundarios).
- Sean útiles para la búsqueda y descubrimiento comercial.
- Eviten redundancias (no elegir "novela" y "narrativa" juntas).
- **EXISTAN TEXTUALMENTE** en la lista de abajo (copia exacta, sin modificaciones).

LISTA CERRADA DE ETIQUETAS VÁLIDAS (usar SOLO estas):
${ETIQUETAS.join(", ")}

## 7. CLASIFICACIÓN POR MATERIAS (classifications)

⚠️ **RESTRICCIÓN CRÍTICA - LEER CON ATENCIÓN**:
- Los códigos que uses DEBEN existir EXACTAMENTE en las listas proporcionadas abajo.
- NO inventes códigos aunque parezcan lógicos o plausibles.
- NO modifiques códigos existentes (ej: no cambies "FIC000000" a "FIC000001").
- Si no encuentras un código específico apropiado, usa uno más general que SÍ exista.
- Copia el código EXACTAMENTE como aparece en la lista (respeta mayúsculas, números, guiones).

Para cada sistema de clasificación (BISAC, THEMA, IBIC), proporciona:
- **2 materias principales**: Las que mejor definen el contenido central.
- **2 materias secundarias**: Aspectos importantes pero no definitorios.
- **2 materias relacionadas**: Temas tangenciales o de interés cruzado.

**Criterios de selección:**
- Prioriza especificidad cuando exista el código específico en la lista.
- Si no existe un código específico, usa el general más cercano que SÍ esté en la lista.
- La justificación debe explicar POR QUÉ esa materia aplica a esta obra específica.
- Verifica que cada código que uses aparece en los listados de abajo antes de incluirlo.

LISTADO COMPLETO DE MATERIAS BISAC (usar SOLO códigos de esta lista):
${materiasBisacList}

LISTADO COMPLETO DE MATERIAS THEMA (usar SOLO códigos de esta lista):
${materiasThemaList}

LISTADO COMPLETO DE MATERIAS IBIC (usar SOLO códigos de esta lista):
${materiasIbicList}

## 8. CITAS BIBLIOGRÁFICAS (citations)

Genera citas en los 5 formatos indicados siguiendo estrictamente las normas de cada estilo.
- Usa los datos extraídos del manuscrito (título, autor).
- Para datos no disponibles, usa estos placeholders exactos: [Editorial], [Año], [Ciudad].
- Usa cursivas markdown para títulos: *Título de la obra*.

**Formatos requeridos:**
- **APA 7ª ed.**: Apellido, N. (Año). *Título*. Editorial.
- **MLA 9ª ed.**: Apellido, Nombre. *Título*. Editorial, Año.
- **Chicago 17ª ed.**: Apellido, Nombre. *Título*. Ciudad: Editorial, Año.
- **Harvard**: Apellido, N. (Año). *Título*. Ciudad: Editorial.
- **Vancouver**: Apellido N. Título. Ciudad: Editorial; Año.

---

# CASOS ESPECIALES

- **Manuscrito incompleto**: Si el texto parece truncado o incompleto, trabaja con la información disponible e indica limitaciones en los campos afectados.
- **Obra colectiva/Antología**: Lista editores o coordinadores como autores, indicando "(ed.)" o "(coord.)".
- **Poesía**: Adapta la sinopsis al formato poético; las etiquetas deben reflejar tradición poética.
- **Teatro**: Indica género dramático; la sinopsis debe mencionar estructura de actos si es relevante.
- **Obras traducidas**: Si detectas que es traducción, menciónalo en la sinopsis si es relevante.
`;

      // Sistema de reintentos para garantizar códigos válidos
      let currentPrompt = basePrompt;
      let resultJson: Omit<AnalysisResult, "wordCount" | "rawText"> | null =
          null;
      let validation: ValidationResult | null = null;
      let attempt = 0;

      while (attempt < MAX_RETRIES) {
        attempt++;
        console.log(`Intento ${attempt}/${MAX_RETRIES} de análisis...`);

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: currentPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: analysisSchema,
          },
        });

        if (!geminiResponse.text) {
          throw new Error("La respuesta de la API de Gemini está vacía.");
        }

        resultJson = JSON.parse(geminiResponse.text) as
            Omit<AnalysisResult, "wordCount" | "rawText">;
        validation = detectInvalidCodes(resultJson);

        if (validation.isValid) {
          console.log(`✓ Validación exitosa en intento ${attempt}`);
          break;
        }

        // Log de códigos inválidos detectados
        console.warn(
          `Intento ${attempt}: Códigos inválidos detectados:`,
          JSON.stringify({
            tags: validation.invalidTags,
            bisac: validation.invalidBisac,
            thema: validation.invalidThema,
            ibic: validation.invalidIbic,
          })
        );

        if (attempt < MAX_RETRIES) {
          // Añadir feedback de corrección al prompt para el siguiente intento
          currentPrompt = basePrompt + buildCorrectionPrompt(validation);
          console.log("Reintentando con prompt de corrección...");
        }
      }

      // Si después de todos los intentos aún hay códigos inválidos,
      // normalizamos el resultado (eliminamos inválidos, corregimos
      // descripciones)
      if (!resultJson) {
        throw new Error("No se pudo obtener respuesta de la IA.");
      }

      if (validation && !validation.isValid) {
        console.warn(
          "Después de " + MAX_RETRIES + " intentos, aún hay códigos inválidos. " +
            "Normalizando resultado..."
        );
      }

      // Normalizar: usar descripciones oficiales y filtrar cualquier
      // código que aún sea inválido
      const normalizedResult = {
        ...resultJson,
        tags: resultJson.tags.filter((tag) => VALID_ETIQUETAS.has(tag)),
        classifications: normalizeClassifications(resultJson.classifications),
      };

      const analysisResult: AnalysisResult = {
        ...normalizedResult,
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
  }
);

export const getTranslation = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
        model: "gemini-3-flash-preview",
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
  }
);

const articleSchema = {
  type: Type.OBJECT,
  properties: {
    article: {
      type: Type.STRING,
      description: "El artículo/reseña completo en formato texto plano.",
    },
  },
  required: ["article"],
};

export const getArticleReview = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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

      // Limitar el texto para el contexto (primeros 50k caracteres)
      const textSample = data.rawText ?
        data.rawText.substring(0, 50000) : "";

      const prompt = `
# ROL

Eres un crítico literario y periodista cultural que escribe para una revista literaria de prestigio. Tu estilo es accesible, ameno y cautivador. Evitas el tono académico o excesivamente formal. Escribes para lectores cultos pero no especializados, con el objetivo de despertar su interés por el libro.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}

**Fragmento del texto** (para análisis de estilo):
${textSample.substring(0, 15000)}

---

# INSTRUCCIONES

Escribe una reseña literaria de **800-1200 palabras** para publicar en la revista. La reseña debe incluir:

## Estructura sugerida:

1. **Apertura cautivadora** (1-2 párrafos)
   - Gancho que atrape al lector desde la primera línea
   - Presentación del libro y su autor de forma atractiva
   - Evita empezar con "En su nueva obra..." o fórmulas similares

2. **Análisis de la obra** (2-3 párrafos)
   - Temas principales y cómo los aborda el autor
   - Puntos fuertes: estructura, personajes, prosa, originalidad
   - Momentos o pasajes destacables (sin spoilers graves)

3. **Contexto literario** (1-2 párrafos)
   - Sitúa la obra en el panorama de la literatura contemporánea
   - Identifica influencias de otros autores o corrientes literarias
   - Compara (brevemente) con obras afines si es pertinente

4. **Valores y aportación** (1 párrafo)
   - Qué aporta este libro al lector
   - Por qué merece la pena leerlo
   - A qué tipo de lector le gustará especialmente

5. **Cierre memorable** (1 párrafo)
   - Frase final que invite a la lectura
   - Evita clichés como "imprescindible" o "no te lo puedes perder"

## Estilo obligatorio:

- ✅ Tono: ameno, persuasivo, periodístico cultural
- ✅ Voz: cercana pero informada, como quien recomienda a un amigo culto
- ✅ Ritmo: párrafos variados, alternando análisis con valoración
- ✅ Usa cursivas (*título*) para mencionar otras obras

- ❌ NO uses tono académico ni jerga literaria excesiva
- ❌ NO uses estructuras tipo "En primer lugar...", "En conclusión..."
- ❌ NO uses superlativos vacíos ("extraordinario", "magistral", "imprescindible")
- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO hagas resumen argumental extenso (eso ya está en la sinopsis)
- ❌ NO reveles giros argumentales ni el final

## Extensión:
Exactamente entre 800 y 1200 palabras. Ni más, ni menos.
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: articleSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json({article: result.article});
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el artículo.";
      console.error("Error generando artículo:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const pressReleaseSchema = {
  type: Type.OBJECT,
  properties: {
    pressRelease: {
      type: Type.STRING,
      description: "El comunicado de prensa completo en formato texto plano.",
    },
  },
  required: ["pressRelease"],
};

export const getPressRelease = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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

      // Extraer nombre de editorial de la cita Chicago (formato: Ciudad: Editorial, Año)
      const extractPublisher = (citations: typeof data.citations): string => {
        const chicago = citations?.chicago || "";
        // Buscar patrón "Ciudad: Editorial, Año" o "Editorial, Año"
        const match = chicago.match(/:\s*([^,]+),\s*\d{4}/) ||
                      chicago.match(/\.\s*([^,]+),\s*\d{4}/);
        if (match && match[1]) {
          const publisher = match[1].trim();
          // Evitar devolver placeholders
          if (!publisher.includes("[") && publisher.length > 2) {
            return publisher;
          }
        }
        return "";
      };

      const publisherName = extractPublisher(data.citations);
      const publisherInfo = publisherName ?
        `**Editorial**: ${publisherName}` :
        "**Editorial**: (No especificada en el documento)";

      const prompt = `
# ROL

Eres el jefe de prensa de una editorial literaria de prestigio. Redactas comunicados de prensa profesionales, claros y atractivos para los medios de comunicación. Tu objetivo es generar interés periodístico en el lanzamiento del libro.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
${publisherInfo}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}

---

# INSTRUCCIONES

Redacta un comunicado de prensa de **400-700 palabras** para anunciar el lanzamiento del libro. El comunicado está dirigido a periodistas culturales, redactores de suplementos literarios y profesionales de los medios.

## Estructura del comunicado:

1. **Titular** (1 línea)
   - Titular periodístico atractivo que resuma la noticia
   - Debe captar la atención del periodista

2. **Subtítulo/Entradilla** (1-2 líneas)
   - Amplía el titular con información clave
   - Incluye autor y editorial si es relevante

3. **Primer párrafo - Lead** (2-3 frases)
   - Responde a las 5W: Qué, Quién, Cuándo, Dónde, Por qué
   - La información más importante primero

4. **Cuerpo del comunicado** (3-4 párrafos)
   - **Sobre la obra**: De qué trata, qué la hace especial, por qué es relevante ahora
   - **Sobre el autor**: Trayectoria, credenciales, por qué está cualificado para escribir esto
   - **Contexto**: Relevancia cultural, tendencias literarias, público objetivo

5. **Cita del autor o editor** (1 párrafo)
   - Inventa una cita entrecomillada atribuida al autor
   - Debe sonar natural y aportar un ángulo personal o emotivo

6. **Información práctica** (datos de cierre)
   - Formato: "Título está disponible en librerías y plataformas digitales."
   - Nota: No incluyas precio, ISBN ni fecha específica (se añadirán después)

7. **Boilerplate** (1 párrafo breve)
   - Si se proporciona el nombre de la editorial, úsalo para el boilerplate. Inventa un párrafo breve y profesional describiendo la editorial (como sello literario comprometido con la calidad, etc.)
   - Si no se proporciona editorial, omite este apartado
   - Contacto de prensa: "Para más información: prensa@[nombre-editorial].com" (usando el nombre real de la editorial)

## Estilo obligatorio:

- ✅ Tono: profesional, informativo, periodístico
- ✅ Escribe en tercera persona
- ✅ Usa frases cortas y párrafos breves
- ✅ Destaca los datos más noticiables
- ✅ Usa cursivas (*título*) para mencionar obras

- ❌ NO uses lenguaje promocional excesivo ("increíble", "imprescindible")
- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses jerga literaria que un periodista generalista no entienda
- ❌ NO incluyas opiniones subjetivas sin atribuir
- ❌ NO hagas el comunicado demasiado largo (máximo 700 palabras)

## Extensión:
Entre 400 y 700 palabras exactamente.
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: pressReleaseSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json({pressRelease: result.pressRelease});
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el comunicado de prensa.";
      console.error("Error generando comunicado de prensa:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const interviewSchema = {
  type: Type.OBJECT,
  properties: {
    introduction: {
      type: Type.STRING,
      description: "Introducción contextual a la entrevista (300-400 palabras).",
    },
    questions: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 10 preguntas para el autor.",
    },
  },
  required: ["introduction", "questions"],
};

export const getInterview = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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

      // Limitar el texto para el contexto
      const textSample = data.rawText ?
        data.rawText.substring(0, 50000) : "";

      const prompt = `
# ROL

Eres un periodista cultural especializado en literatura que prepara entrevistas para una revista literaria de prestigio. Tu trabajo consiste en formular preguntas perspicaces, originales y reveladoras que permitan al autor profundizar en su obra y su proceso creativo.

---

# DATOS DE LA OBRA Y EL AUTOR

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}

**Fragmento del texto** (para contexto):
${textSample.substring(0, 15000)}

---

# INSTRUCCIONES

Genera una entrevista que consta de DOS partes:

## PARTE 1: INTRODUCCIÓN (300-400 palabras)

Redacta una introducción contextual que:
- Presente al autor y su trayectoria de forma atractiva
- Sitúe la obra en el contexto de su carrera y del panorama literario actual
- Anticipe los temas principales que se abordarán en la entrevista
- Genere interés en el lector para continuar leyendo

**Estilo de la introducción:**
- Tono: periodístico cultural, cercano pero informado
- Evita hagiografías o elogios vacíos
- Usa cursivas (*título*) para mencionar obras
- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses superlativos vacíos ("extraordinario", "magistral", "imprescindible")

## PARTE 2: PREGUNTAS (exactamente 10)

Formula 10 preguntas para el autor. Las preguntas deben:

**Distribución temática:**
- 3-4 preguntas sobre la OBRA específica (temas, personajes, estructura, intenciones)
- 2-3 preguntas sobre el PROCESO CREATIVO (cómo escribió, investigación, decisiones)
- 2-3 preguntas sobre la CARRERA del autor (trayectoria, influencias, evolución)
- 1-2 preguntas más PERSONALES o reflexivas (relación con la escritura, proyectos futuros)

**Características de las preguntas:**
- Abiertas (que no se puedan responder con sí/no)
- Específicas (que demuestren conocimiento de la obra)
- Originales (evita preguntas genéricas tipo "¿Cómo surgió la idea?")
- Profundas (que inviten a la reflexión, no respuestas superficiales)
- Variadas en enfoque y extensión

**Formato de las preguntas:**
- Cada pregunta debe ser clara y directa
- Puedes incluir breve contexto antes de la pregunta si es necesario
- Numera las preguntas del 1 al 10

**IMPORTANTE:**
- NO inventes respuestas. Solo genera las preguntas.
- Las respuestas serán proporcionadas por el autor posteriormente.
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: interviewSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json({
        introduction: result.introduction,
        questions: result.questions,
      });
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar la entrevista.";
      console.error("Error generando entrevista:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const backCoverSchema = {
  type: Type.OBJECT,
  properties: {
    backCoverText: {
      type: Type.STRING,
      description: "Texto de solapa/contraportada (150-200 palabras).",
    },
  },
  required: ["backCoverText"],
};

export const getBackCoverText = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres un redactor publicitario editorial especializado en textos de contraportada. Tu objetivo es crear un texto breve, impactante y persuasivo que convenza al lector de comprar el libro en los pocos segundos que dedica a leer la contraportada en una librería.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis completa**: ${data.synopsis}

---

# INSTRUCCIONES

Redacta un texto de solapa/contraportada de **150-200 palabras** que:

**Estructura:**
1. **Gancho inicial** (1-2 frases): Algo que atrape inmediatamente
2. **Premisa central** (2-3 frases): De qué trata sin revelar demasiado
3. **Tensión/promesa** (1-2 frases): Qué está en juego, por qué leerlo

**Estilo obligatorio:**
- ✅ Tono: directo, evocador, con gancho comercial
- ✅ Frases cortas y contundentes
- ✅ Crear intriga sin spoilers
- ✅ Adaptado al género (thriller: tensión; romance: emoción; ensayo: relevancia)

- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses imperativos ("descubre", "adéntrate", "sumérgete")
- ❌ NO uses superlativos vacíos ("extraordinario", "imprescindible", "magistral")
- ❌ NO uses frases hechas ("un viaje", "una historia que cambiará...")
- ❌ NO menciones premios ni credenciales del autor (eso va en otra parte)

**Extensión:** Exactamente entre 150 y 200 palabras.
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: backCoverSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json({backCoverText: result.backCoverText});
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el texto de solapa.";
      console.error("Error generando texto de solapa:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const socialMediaSchema = {
  type: Type.OBJECT,
  properties: {
    twitter: {
      type: Type.STRING,
      description: "Post para Twitter/X (máximo 280 caracteres).",
    },
    instagram: {
      type: Type.STRING,
      description: "Caption para Instagram (150-300 palabras con emojis y hashtags).",
    },
    facebook: {
      type: Type.STRING,
      description: "Post para Facebook (100-200 palabras, tono cercano).",
    },
    linkedin: {
      type: Type.STRING,
      description: "Post para LinkedIn (150-250 palabras, tono profesional).",
    },
  },
  required: ["twitter", "instagram", "facebook", "linkedin"],
};

export const getSocialMediaPosts = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres un community manager especializado en promoción editorial. Creas contenido atractivo para redes sociales que genera engagement y despierta interés por los libros sin parecer spam publicitario.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Etiquetas**: ${data.tags.join(", ")}

---

# INSTRUCCIONES

Genera posts promocionales para 4 redes sociales. Cada uno debe tener el tono y formato apropiado para su plataforma.

## 1. TWITTER/X (máximo 280 caracteres)
- Breve, impactante, con gancho
- Puede incluir 1-2 emojis relevantes
- Incluir 2-3 hashtags al final
- Mencionar título y autor

## 2. INSTAGRAM (150-300 palabras)
- Tono cercano y emocional
- Estructura: gancho + desarrollo + llamada a la acción
- Emojis distribuidos naturalmente (no excesivos)
- 5-10 hashtags relevantes al final (en línea separada)
- Incluir llamada a la acción ("link en bio", "disponible en librerías")

## 3. FACEBOOK (100-200 palabras)
- Tono conversacional y cercano
- Puede incluir pregunta para generar interacción
- Menos hashtags que Instagram (2-3 máximo)
- Invitar a comentar o compartir

## 4. LINKEDIN (150-250 palabras)
- Tono profesional pero accesible
- Enfocado en el valor del libro, aprendizajes o relevancia
- Puede mencionar la trayectoria del autor si es relevante
- Sin emojis o muy pocos
- 3-5 hashtags profesionales

**RESTRICCIONES PARA TODOS:**
- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses superlativos vacíos ("extraordinario", "imprescindible")
- ❌ NO uses lenguaje de vendedor agresivo
- ✅ SÍ menciona el título con formato *Título* (cursiva markdown)
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: socialMediaSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json({
        twitter: result.twitter,
        instagram: result.instagram,
        facebook: result.facebook,
        linkedin: result.linkedin,
      });
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar los posts para redes sociales.";
      console.error("Error generando posts:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const salesPitchSchema = {
  type: Type.OBJECT,
  properties: {
    targetAudience: {
      type: Type.STRING,
      description: "Descripción del público objetivo (2-3 párrafos).",
    },
    salesHooks: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 5-7 ganchos de venta.",
    },
    differentiators: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 3-5 elementos diferenciadores.",
    },
    objectionHandlers: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 3-4 respuestas a posibles objeciones.",
    },
    elevatorPitch: {
      type: Type.STRING,
      description: "Pitch de 30 segundos (2-3 frases).",
    },
  },
  required: [
    "targetAudience",
    "salesHooks",
    "differentiators",
    "objectionHandlers",
    "elevatorPitch",
  ],
};

export const getSalesPitch = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres el director comercial de una editorial con 20 años de experiencia en ventas de libros. Tu trabajo es preparar argumentarios de venta efectivos que ayuden al equipo comercial a presentar y vender libros a librerías, distribuidores y clientes.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Etiquetas**: ${data.tags.join(", ")}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}

---

# INSTRUCCIONES

Genera un argumentario de ventas completo con las siguientes secciones:

## 1. PÚBLICO OBJETIVO (2-3 párrafos)
Define con precisión:
- Perfil demográfico (edad, género, nivel educativo)
- Intereses y hábitos de lectura
- Por qué este libro les atraerá específicamente
- Dónde encontrar a estos lectores (canales, comunidades)

## 2. GANCHOS DE VENTA (5-7 puntos)
Frases cortas y contundentes que el comercial puede usar:
- Cada gancho debe ser memorable y persuasivo
- Enfocados en beneficios, no características
- Variados: emocionales, racionales, de autoridad, de urgencia

## 3. ELEMENTOS DIFERENCIADORES (3-5 puntos)
Qué hace único a este libro frente a la competencia:
- Enfoque o perspectiva única
- Credenciales del autor
- Momento oportuno (tendencias, actualidad)
- Formato o estructura innovadora

## 4. MANEJO DE OBJECIONES (3-4 puntos)
Respuestas preparadas para objeciones típicas:
- "Ya tenemos muchos libros de este tema"
- "El autor no es conocido"
- "No creo que se venda bien"
- Cada respuesta debe ser breve y convincente

## 5. ELEVATOR PITCH (2-3 frases)
Resumen de 30 segundos para captar interés inmediato.

**ESTILO:**
- ✅ Lenguaje comercial directo y persuasivo
- ✅ Datos concretos cuando sea posible
- ✅ Enfocado en resultados y beneficios
- ❌ NO uses construcciones "no es [A], sino [B]"
- ❌ NO uses superlativos vacíos sin justificación
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: salesPitchSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json(result);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el argumentario de ventas.";
      console.error("Error generando argumentario:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const bookstoreEmailSchema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description: "Asunto del email (máximo 60 caracteres).",
    },
    body: {
      type: Type.STRING,
      description: "Cuerpo del email (300-400 palabras).",
    },
  },
  required: ["subject", "body"],
};

export const getBookstoreEmail = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres el responsable de comunicación comercial de una editorial. Redactas emails profesionales y persuasivos para presentar novedades editoriales a libreros y responsables de compras de librerías.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Etiquetas**: ${data.tags.join(", ")}

---

# INSTRUCCIONES

Genera un email de presentación para enviar a librerías con:

## ASUNTO (máximo 60 caracteres)
- Debe captar atención inmediata
- Incluir el título del libro
- Evitar palabras spam ("gratis", "oferta", "urgente")

## CUERPO DEL EMAIL (300-400 palabras)

**Estructura:**

1. **Saludo** (1 línea)
   - Profesional pero cercano
   - "Estimado/a librero/a" o similar

2. **Introducción** (2-3 frases)
   - Presentar la novedad brevemente
   - Generar interés inmediato

3. **Sobre el libro** (1 párrafo)
   - Sinopsis breve adaptada para el librero
   - Por qué funcionará en su librería
   - Público objetivo claro

4. **Sobre el autor** (1 párrafo breve)
   - Credenciales relevantes
   - Por qué es una apuesta segura

5. **Argumentos comerciales** (3-4 puntos en lista)
   - Por qué este libro se venderá
   - Tendencias del mercado
   - Comparables de éxito si aplica

6. **Llamada a la acción** (1-2 frases)
   - Invitar a solicitar ejemplares
   - Ofrecer material promocional
   - Mencionar condiciones (sin detallar)

7. **Despedida y firma**
   - Profesional
   - Dejar espacio para datos de contacto [NOMBRE] [CARGO] [EDITORIAL]

**ESTILO:**
- ✅ Tono profesional pero accesible
- ✅ Orientado a beneficios para el librero
- ✅ Conciso y fácil de escanear
- ✅ Usa cursivas (*título*) para el libro
- ❌ NO uses construcciones "no es [A], sino [B]"
- ❌ NO seas excesivamente promocional
- ❌ NO uses lenguaje de spam comercial
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: bookstoreEmailSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json(result);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el email para librerías.";
      console.error("Error generando email:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const readingReportSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Resumen ejecutivo del manuscrito (150-200 palabras).",
    },
    literaryAnalysis: {
      type: Type.STRING,
      description: "Análisis literario: estilo, estructura, voz narrativa (300-400 palabras).",
    },
    strengths: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 4-6 puntos fuertes de la obra.",
    },
    weaknesses: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "Lista de 3-5 puntos débiles o áreas de mejora.",
    },
    marketAnalysis: {
      type: Type.STRING,
      description: "Análisis de mercado y potencial comercial (200-300 palabras).",
    },
    targetAudience: {
      type: Type.STRING,
      description: "Público objetivo detallado (100-150 palabras).",
    },
    recommendation: {
      type: Type.STRING,
      enum: ["PUBLICAR", "PUBLICAR_CON_CAMBIOS", "RECHAZAR"],
      description: "Recomendación editorial.",
    },
    recommendationJustification: {
      type: Type.STRING,
      description: "Justificación de la recomendación (150-200 palabras).",
    },
  },
  required: [
    "summary",
    "literaryAnalysis",
    "strengths",
    "weaknesses",
    "marketAnalysis",
    "targetAudience",
    "recommendation",
    "recommendationJustification",
  ],
};

export const getReadingReport = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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

      // Usar más texto para un análisis más profundo
      const textSample = data.rawText ?
        data.rawText.substring(0, 80000) : "";

      const prompt = `
# ROL

Eres un lector editorial senior con 20 años de experiencia evaluando manuscritos para una editorial literaria de prestigio. Tu trabajo es elaborar informes de lectura internos que ayuden al comité editorial a decidir sobre la publicación de obras.

Tu informe debe ser honesto, riguroso y profesional. No estás escribiendo para el autor ni para el público, sino para editores que necesitan tomar decisiones de inversión.

---

# MANUSCRITO A EVALUAR

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}

**Texto del manuscrito** (fragmento para análisis):
${textSample}

---

# INSTRUCCIONES

Elabora un informe de lectura editorial completo con las siguientes secciones:

## 1. RESUMEN EJECUTIVO (150-200 palabras)
- Síntesis objetiva de la obra: género, tema, enfoque
- Primera impresión general
- Posicionamiento potencial en el catálogo

## 2. ANÁLISIS LITERARIO (300-400 palabras)
Evalúa con rigor profesional:
- **Estructura narrativa**: ¿Funciona la arquitectura de la obra?
- **Estilo y voz**: ¿Es distintivo? ¿Está bien ejecutado?
- **Personajes** (si aplica): ¿Están bien construidos? ¿Evolución?
- **Ritmo y tensión**: ¿Mantiene el interés?
- **Originalidad**: ¿Aporta algo nuevo al género/tema?
- **Prosa**: Calidad de la escritura a nivel de frase

## 3. PUNTOS FUERTES (4-6 puntos)
Lista de elementos que funcionan bien:
- Cada punto debe ser específico y justificado
- Referencia a ejemplos concretos del texto cuando sea posible

## 4. PUNTOS DÉBILES O ÁREAS DE MEJORA (3-5 puntos)
Lista de elementos problemáticos:
- Ser constructivo pero honesto
- Indicar si son problemas menores o estructurales
- Sugerir posibles soluciones si aplica

## 5. ANÁLISIS DE MERCADO (200-300 palabras)
- ¿Existe demanda para este tipo de libro?
- ¿Cómo está el mercado en este género/tema?
- Potencial comercial realista (alto/medio/bajo)
- Factores de riesgo comercial
- Oportunidades de posicionamiento

## 6. PÚBLICO OBJETIVO (100-150 palabras)
- Perfil del lector ideal
- Segmentos secundarios
- Canales de venta más apropiados

## 7. RECOMENDACIÓN EDITORIAL
Elige UNA de estas tres opciones:
- **PUBLICAR**: La obra está lista para publicación
- **PUBLICAR_CON_CAMBIOS**: Requiere edición/revisiones antes de publicar
- **RECHAZAR**: No se recomienda su publicación

## 8. JUSTIFICACIÓN DE LA RECOMENDACIÓN (150-200 palabras)
- Argumenta tu decisión
- Si recomiendas cambios, especifica cuáles
- Si rechazas, explica los motivos principales
- Considera balance entre calidad literaria y viabilidad comercial

---

# ESTILO DEL INFORME

- ✅ Tono: profesional, objetivo, analítico
- ✅ Lenguaje: preciso, sin ambigüedades
- ✅ Enfoque: equilibrio entre lo literario y lo comercial
- ✅ Honestidad: señalar problemas sin suavizarlos
- ❌ NO uses halagos vacíos ni lenguaje promocional
- ❌ NO uses construcciones "no es [A], sino [B]"
- ❌ NO seas condescendiente ni excesivamente duro
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: readingReportSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json(result);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar el informe de lectura.";
      console.error("Error generando informe de lectura:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const comparableSchema = {
  type: Type.OBJECT,
  properties: {
    title: {type: Type.STRING},
    author: {type: Type.STRING},
    publisher: {type: Type.STRING},
    year: {type: Type.NUMBER},
    reason: {type: Type.STRING},
    differentiator: {type: Type.STRING},
  },
  required: ["title", "author", "publisher", "year", "reason", "differentiator"],
};

const comparablesSchema = {
  type: Type.OBJECT,
  properties: {
    comparables: {
      type: Type.ARRAY,
      items: comparableSchema,
      description: "Lista de 5-7 libros comparables.",
    },
    marketPositioning: {
      type: Type.STRING,
      description: "Posicionamiento de mercado basado en los comparables (150-200 palabras).",
    },
  },
  required: ["comparables", "marketPositioning"],
};

export const getComparables = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres un experto en mercado editorial con amplio conocimiento de la producción literaria española e internacional de los últimos 20 años. Tu trabajo es identificar libros comparables (comps) que ayuden a posicionar una nueva publicación en el mercado.

Los comparables son esenciales para: presentar el libro a libreros, definir estrategias de marketing, y establecer expectativas de ventas realistas.

---

# OBRA A POSICIONAR

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Etiquetas**: ${data.tags.join(", ")}
**Clasificación BISAC**: ${data.classifications.bisac.main.map((m) => m.description).join(", ")}

---

# INSTRUCCIONES

Identifica 5-7 libros comparables siguiendo estos criterios:

## CRITERIOS DE SELECCIÓN

Los comparables deben ser:
1. **Publicados en los últimos 10-15 años** (preferiblemente)
2. **Disponibles en el mercado español** (publicados o traducidos)
3. **Exitosos comercialmente** o con buena recepción crítica
4. **Similares en**: tema, tono, estilo, público objetivo o propuesta

## TIPOS DE COMPARABLES A INCLUIR

Busca variedad:
- 2-3 comparables **temáticos** (mismo tema o género)
- 1-2 comparables **estilísticos** (mismo tono o enfoque narrativo)
- 1-2 comparables **de audiencia** (mismo público objetivo)

## PARA CADA COMPARABLE, PROPORCIONA:

1. **Título** (en español si hay traducción publicada)
2. **Autor**
3. **Editorial** (la edición española si existe)
4. **Año de publicación** (de la edición original o española)
5. **Razón de comparabilidad** (2-3 frases explicando por qué es comparable)
6. **Diferenciador** (1-2 frases sobre qué hace diferente/mejor al libro que analizamos)

## POSICIONAMIENTO DE MERCADO (150-200 palabras)

Basándote en los comparables identificados:
- ¿Dónde encaja este libro en el mercado actual?
- ¿Qué hueco puede ocupar?
- ¿Cómo debería presentarse frente a la competencia?
- ¿Qué expectativas de ventas sugieren los comparables?

---

# RESTRICCIONES

- ✅ Usa libros REALES que existan y estén publicados
- ✅ Verifica que los datos (autor, editorial, año) sean correctos
- ✅ Prioriza éxitos recientes sobre clásicos muy antiguos
- ✅ Incluye tanto bestsellers como libros de prestigio crítico
- ❌ NO inventes títulos ni autores
- ❌ NO uses libros demasiado antiguos (antes de 2005) salvo excepciones justificadas
- ❌ NO uses construcciones "no es [A], sino [B]"
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: comparablesSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json(result);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar los comparables.";
      console.error("Error generando comparables:", error);
      response.status(500).send(errorMessage);
    }
  }
);

const seoKeywordsSchema = {
  type: Type.OBJECT,
  properties: {
    primaryKeywords: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "7-10 palabras clave principales de alto volumen.",
    },
    longTailKeywords: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "10-15 frases long-tail específicas.",
    },
    thematicKeywords: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "5-8 palabras clave temáticas/de género.",
    },
    audienceKeywords: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "5-7 palabras clave orientadas al público objetivo.",
    },
    amazonCategories: {
      type: Type.ARRAY,
      items: {type: Type.STRING},
      description: "3-5 categorías sugeridas para Amazon.",
    },
    metaDescription: {
      type: Type.STRING,
      description: "Meta descripción SEO (150-160 caracteres).",
    },
  },
  required: [
    "primaryKeywords",
    "longTailKeywords",
    "thematicKeywords",
    "audienceKeywords",
    "amazonCategories",
    "metaDescription",
  ],
};

export const getSeoKeywords = onRequest(
  {cors: true, secrets: [geminiApiKey]},
  async (request, response) => {
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
# ROL

Eres un especialista en SEO editorial con experiencia en posicionamiento de libros en plataformas de venta online (Amazon, Casa del Libro, FNAC, Google Books) y optimización de metadatos ONIX. Tu trabajo es generar palabras clave estratégicas que maximicen la visibilidad y descubribilidad del libro.

---

# DATOS DEL LIBRO

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Etiquetas editoriales**: ${data.tags.join(", ")}
**Clasificación BISAC**: ${data.classifications.bisac.main.map((m) => m.description).join(", ")}
**Clasificación THEMA**: ${data.classifications.thema.main.map((m) => m.description).join(", ")}

---

# INSTRUCCIONES

Genera un conjunto completo de palabras clave SEO optimizadas para el mercado editorial español:

## 1. PALABRAS CLAVE PRINCIPALES (7-10)
- Keywords de alto volumen de búsqueda
- Términos genéricos pero relevantes
- Incluir género literario, tema principal
- Formato: palabras sueltas o frases muy cortas (2-3 palabras máx.)
- Ejemplo: "novela histórica", "thriller psicológico", "amor", "misterio"

## 2. PALABRAS CLAVE LONG-TAIL (10-15)
- Frases específicas de 3-6 palabras
- Menor competencia, mayor intención de compra
- Incluir combinaciones de género + tema + elemento distintivo
- Ejemplo: "novela romántica ambientada en París", "thriller con protagonista femenina"

## 3. PALABRAS CLAVE TEMÁTICAS (5-8)
- Centradas en los temas específicos del libro
- Motivos, escenarios, épocas históricas
- Ejemplo: "Segunda Guerra Mundial", "secretos familiares", "redención"

## 4. PALABRAS CLAVE DE AUDIENCIA (5-7)
- Orientadas al público objetivo
- Incluir comparaciones con otros autores/libros conocidos
- Ejemplo: "para fans de Ken Follett", "lectores de novela negra española"

## 5. CATEGORÍAS AMAZON SUGERIDAS (3-5)
- Categorías específicas del árbol de Amazon España
- Formato: ruta completa de categoría
- Ejemplo: "Libros > Literatura y ficción > Novela histórica"

## 6. META DESCRIPCIÓN SEO (150-160 caracteres)
- Incluir título y autor
- Gancho que invite al clic
- Palabra clave principal al inicio

---

# RESTRICCIONES

- ✅ Palabras clave en ESPAÑOL (mercado España)
- ✅ Términos que los lectores realmente buscan
- ✅ Evitar tecnicismos editoriales
- ✅ Priorizar términos con volumen de búsqueda
- ❌ NO usar el título exacto del libro como keyword
- ❌ NO usar términos demasiado genéricos ("libro", "leer")
- ❌ NO usar keywords irrelevantes para el contenido
- ❌ NO inventar categorías de Amazon que no existan
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: seoKeywordsSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const result = JSON.parse(geminiResponse.text);
      response.status(200).json(result);
    } catch (error) {
      const errorMessage = "Error interno del servidor: " +
        "No se pudo generar las palabras clave SEO.";
      console.error("Error generando palabras clave SEO:", error);
      response.status(500).send(errorMessage);
    }
  }
);
