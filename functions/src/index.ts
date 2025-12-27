// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {GoogleGenAI, Type} from "@google/genai";
import {defineSecret} from "firebase-functions/params";

import {MATERIAS_BISAC} from "./data/materiasBisac";
import {MATERIAS_THEMA} from "./data/materiasThema";
import {MATERIAS_IBIC} from "./data/materiasIbic";
import {ETIQUETAS} from "./data/etiquetas";
import {MARKETING_EDITOR_SYSTEM_PROMPT} from "./data/marketingEditorPrompt";
import {AnalysisResult, TranslatedResult, SubjectClassification, CommercialData} from "./types";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Normas ortotipográficas para contenidos editoriales.
 * Se incluye en todos los prompts de generación de contenido.
 */
const NORMAS_ORTOTIPOGRAFICAS = `
# NORMAS ORTOTIPOGRÁFICAS (OBLIGATORIO)

Como contenido de una editorial profesional, DEBES respetar estrictamente las siguientes normas ortotipográficas del español:

## USO DE CURSIVA (markdown: *texto*)

**SIEMPRE en cursiva:**
- Títulos de libros: *El Quijote*, *Cien años de soledad*
- Títulos de películas: *Casablanca*, *El Padrino*
- Títulos de obras de teatro: *La casa de Bernarda Alba*
- Títulos de óperas y obras musicales largas: *La Traviata*, *El barbero de Sevilla*
- Títulos de obras de arte (pinturas, esculturas): *Las Meninas*, *El Guernica*
- Nombres de periódicos y revistas: *El País*, *The New York Times*
- Palabras extranjeras no adaptadas: *best seller*, *marketing*, *feedback*
- Latinismos crudos: *a priori*, *in situ*, *ipso facto*
- Nombres científicos: *Homo sapiens*, *Canis lupus*
- Apodos cuando acompañan al nombre: Alfonso X *el Sabio*

**NUNCA en cursiva:**
- Títulos de poemas, artículos o capítulos (van entre comillas: «El cuervo»)
- Nombres propios de personas, lugares o instituciones
- Citas textuales (van entre comillas)
- Palabras extranjeras ya adaptadas: fútbol, béisbol, líder

## USO DE COMILLAS ESPAÑOLAS («»)

- Citas textuales: «La vida es sueño»
- Títulos de capítulos, artículos, poemas, canciones: «Canción del pirata»
- Significados o traducciones: la palabra *Weltanschauung* («cosmovisión»)
- Uso irónico o enfático de una palabra

## VERIFICACIÓN ANTES DE ENTREGAR

Antes de generar la respuesta, verifica que:
1. ✅ TODO título de libro, película, obra de arte → en cursiva (*título*)
2. ✅ TODO extranjerismo no adaptado → en cursiva
3. ✅ TODA cita textual → entre comillas españolas («cita»)
4. ✅ Los títulos mencionados en el texto de origen mantienen su cursiva
`;
const ghostAdminApiKey = defineSecret("GHOST_ADMIN_API_KEY");

// Configuración de Ghost
const GHOST_API_URL = "https://lunacritica.com";

/**
 * Genera un JWT para autenticar con la API Admin de Ghost
 * @param {string} apiKey - La API key de Ghost en formato "id:secret"
 * @return {string} Token JWT firmado
 */
function generateGhostJWT(apiKey: string): string {
  const [id, secret] = apiKey.split(":");

  // Header
  const header = {
    alg: "HS256",
    typ: "JWT",
    kid: id,
  };

  // Payload con expiración de 5 minutos
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + 5 * 60,
    aud: "/admin/",
  };

  // Codificar header y payload en base64url
  const base64urlEncode = (obj: object): string => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const headerB64 = base64urlEncode(header);
  const payloadB64 = base64urlEncode(payload);

  // Crear firma HMAC-SHA256
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("crypto");
  const secretBuffer = Buffer.from(secret, "hex");
  const signature = crypto
    .createHmac("sha256", secretBuffer)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${headerB64}.${payloadB64}.${signature}`;
}

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
 * Formatea los datos comerciales para incluirlos en los prompts de IA.
 * @param {CommercialData | undefined} data - Datos comerciales opcionales.
 * @return {string} Texto formateado con los datos comerciales.
 */
function formatCommercialData(data?: CommercialData): string {
  if (!data || Object.keys(data).length === 0) {
    return "";
  }

  const parts: string[] = [];

  if (data.coverImageUrl) {
    parts.push(`- **Portada:** ${data.coverImageUrl}`);
  }
  if (data.authorPhotoUrl) {
    parts.push(`- **Foto del autor:** ${data.authorPhotoUrl}`);
  }
  if (data.publisher) {
    parts.push(`- **Editorial:** ${data.publisher}`);
  }
  if (data.publicationDate) {
    const date = new Date(data.publicationDate);
    parts.push(`- **Fecha de publicación:** ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long", day: "numeric"})}`);
  }
  if (data.price && data.currency) {
    const currencySymbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
    parts.push(`- **PVP:** ${data.price} ${currencySymbols[data.currency] || data.currency}`);
  }
  if (data.isbn) {
    parts.push(`- **ISBN:** ${data.isbn}`);
  }
  if (data.pages) {
    parts.push(`- **Páginas:** ${data.pages}`);
  }
  if (data.format) {
    const formatLabels: Record<string, string> = {
      hardcover: "Cartoné",
      paperback: "Rústica",
      ebook: "eBook",
      audiobook: "Audiolibro",
    };
    parts.push(`- **Formato:** ${formatLabels[data.format] || data.format}`);
  }
  if (data.collection) {
    parts.push(`- **Colección:** ${data.collection}`);
  }
  if (data.originalTitle) {
    parts.push(`- **Título original:** ${data.originalTitle}`);
  }
  if (data.translator) {
    parts.push(`- **Traductor/a:** ${data.translator}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n\n### Datos comerciales\n${parts.join("\n")}`;
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
    extractedEditorialData: {
      type: Type.OBJECT,
      nullable: true,
      description: "Datos editoriales extraídos del manuscrito (si están " +
        "presentes en página de créditos, colofón o portada).",
      properties: {
        isbn: {
          type: Type.STRING,
          nullable: true,
          description: "ISBN-13 o ISBN-10 si aparece en el documento.",
        },
        pages: {
          type: Type.NUMBER,
          nullable: true,
          description: "Número de páginas si aparece indicado.",
        },
        collection: {
          type: Type.STRING,
          nullable: true,
          description: "Nombre de la colección editorial si se menciona.",
        },
        publisher: {
          type: Type.STRING,
          nullable: true,
          description: "Editorial si aparece en página de créditos.",
        },
        originalTitle: {
          type: Type.STRING,
          nullable: true,
          description: "Título original si es una traducción.",
        },
        translator: {
          type: Type.STRING,
          nullable: true,
          description: "Nombre del traductor si es una traducción.",
        },
        publicationYear: {
          type: Type.STRING,
          nullable: true,
          description: "Año de publicación si aparece.",
        },
      },
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
  {
    cors: true,
    secrets: [geminiApiKey],
    timeoutSeconds: 300, // 5 minutos para análisis largos con reintentos
    memory: "512MiB",
  },
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

${text.substring(0, 800000)}

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

## 9. DATOS EDITORIALES (extractedEditorialData) - OPCIONAL

⚠️ **IMPORTANTE**: Este campo es para EXTRAER datos que YA EXISTEN en el manuscrito, NO para inventarlos. Solo rellena los campos que encuentres explícitamente.

Busca en las primeras y últimas páginas del manuscrito (portada, página de créditos, colofón, contraportada) la siguiente información:

- **isbn**: Código ISBN-10 o ISBN-13 si aparece. Formato: "978-84-XXXXX-XX-X" o similar.
- **pages**: Número total de páginas si está indicado.
- **collection**: Nombre de la colección editorial (ej: "Colección Austral", "Biblioteca Clásica").
- **publisher**: Nombre de la editorial si aparece en créditos.
- **originalTitle**: Si es una traducción, el título en el idioma original.
- **translator**: Nombre del traductor/a si es una obra traducida.
- **publicationYear**: Año de publicación si aparece (formato: "2024").

**Reglas:**
- Si un dato NO aparece explícitamente en el documento, devuelve null para ese campo.
- NO inventes datos. Solo extrae lo que está escrito.
- Si el documento es un manuscrito sin maquetar, es normal que no tenga estos datos.
- Si encuentras ISBN, verifica que tenga formato válido (10 o 13 dígitos).

---

# CASOS ESPECIALES

- **Manuscrito incompleto**: Si el texto parece truncado o incompleto, trabaja con la información disponible e indica limitaciones en los campos afectados.
- **Obra colectiva/Antología**: Lista editores o coordinadores como autores, indicando "(ed.)" o "(coord.)".
- **Poesía**: Adapta la sinopsis al formato poético; las etiquetas deben reflejar tradición poética.
- **Teatro**: Indica género dramático; la sinopsis debe mencionar estructura de actos si es relevante.
- **Obras traducidas**: Si detectas que es traducción, menciónalo en la sinopsis si es relevante.

${NORMAS_ORTOTIPOGRAFICAS}
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
      description: "El artículo/reseña completo. IMPORTANTE: Usa dos " +
        "saltos de línea (\\n\\n) entre cada párrafo para mantener " +
        "el formato estructurado. El artículo debe tener párrafos " +
        "claramente separados.",
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Limitar el texto para el contexto (primeros 50k caracteres)
      const textSample = data.rawText ?
        data.rawText.substring(0, 50000) : "";

      const commercialDataSection = formatCommercialData(commercialData);

      const prompt = `
# ROL

Eres un crítico literario y periodista cultural que escribe para una revista literaria de prestigio. Tu estilo es accesible, ameno y cautivador. Evitas el tono académico o excesivamente formal. Escribes para lectores cultos pero no especializados, con el objetivo de despertar su interés por el libro.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}${commercialDataSection}

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

${NORMAS_ORTOTIPOGRAFICAS}

---

# FORMATO DE SALIDA

⚠️ **CRÍTICO**: El artículo debe estar estructurado con saltos de línea dobles (\\n\\n) entre cada párrafo. Cada sección (apertura, análisis, contexto, cierre) debe comenzar en un nuevo párrafo. NO devuelvas todo el texto en una sola línea continua.
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
      description: "El comunicado de prensa completo. IMPORTANTE: Usa " +
        "dos saltos de línea (\\n\\n) entre cada párrafo o sección para " +
        "mantener el formato estructurado. Cada sección debe estar " +
        "claramente separada.",
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Extraer nombre de editorial de commercialData o de la cita Chicago
      const extractPublisher = (citations: typeof data.citations): string => {
        const chicago = citations?.chicago || "";
        const match = chicago.match(/:\s*([^,]+),\s*\d{4}/) ||
                      chicago.match(/\.\s*([^,]+),\s*\d{4}/);
        if (match && match[1]) {
          const publisher = match[1].trim();
          if (!publisher.includes("[") && publisher.length > 2) {
            return publisher;
          }
        }
        return "";
      };

      // Priorizar datos comerciales sobre extracción de citas
      const publisherName = commercialData?.publisher || extractPublisher(data.citations);
      const publisherInfo = publisherName ?
        `**Editorial**: ${publisherName}` :
        "**Editorial**: (No especificada en el documento)";

      // Datos comerciales adicionales para el comunicado
      const commercialDetails: string[] = [];
      if (commercialData?.publicationDate) {
        const date = new Date(commercialData.publicationDate);
        commercialDetails.push(`**Fecha de publicación**: ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long", day: "numeric"})}`);
      }
      if (commercialData?.isbn) {
        commercialDetails.push(`**ISBN**: ${commercialData.isbn}`);
      }
      if (commercialData?.pages) {
        commercialDetails.push(`**Páginas**: ${commercialData.pages}`);
      }
      if (commercialData?.price && commercialData?.currency) {
        const symbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
        commercialDetails.push(`**PVP**: ${commercialData.price} ${symbols[commercialData.currency] || commercialData.currency}`);
      }
      if (commercialData?.translator) {
        commercialDetails.push(`**Traducción**: ${commercialData.translator}`);
      }
      if (commercialData?.originalTitle) {
        commercialDetails.push(`**Título original**: ${commercialData.originalTitle}`);
      }
      if (commercialData?.format) {
        const formatLabels: Record<string, string> = {
          hardcover: "Cartoné",
          paperback: "Rústica",
          ebook: "eBook",
          audiobook: "Audiolibro",
        };
        commercialDetails.push(`**Formato**: ${formatLabels[commercialData.format] || commercialData.format}`);
      }
      if (commercialData?.collection) {
        commercialDetails.push(`**Colección**: ${commercialData.collection}`);
      }

      const commercialSection = commercialDetails.length > 0 ?
        `\n${commercialDetails.join("\n")}` : "";

      // URLs de imágenes disponibles
      const imageSection = [];
      if (commercialData?.coverImageUrl) {
        imageSection.push(`**URL de portada**: ${commercialData.coverImageUrl}`);
      }
      if (commercialData?.authorPhotoUrl) {
        imageSection.push(`**URL foto del autor**: ${commercialData.authorPhotoUrl}`);
      }
      const imagesInfo = imageSection.length > 0 ?
        `\n\n### Imágenes disponibles para prensa\n${imageSection.join("\n")}` : "";

      const prompt = `
# ROL: JEFE DE PRENSA EDITORIAL

Eres el jefe de prensa de una editorial literaria de prestigio con amplia experiencia en medios culturales españoles y latinoamericanos. Redactas comunicados de prensa profesionales siguiendo la estructura periodística de pirámide invertida. Tu objetivo es generar interés periodístico real en el lanzamiento del libro.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
${publisherInfo}${commercialSection}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Extensión**: ${data.wordCount.toLocaleString("es-ES")} palabras${imagesInfo}

---

# ÁNGULOS NOTICIOSOS A CONSIDERAR

Antes de redactar, identifica el ángulo más noticioso:
- **Actualidad**: ¿Conecta con debates, efemérides o tendencias actuales?
- **Novedad**: ¿Es el debut del autor? ¿Un regreso esperado? ¿Un giro en su carrera?
- **Relevancia social**: ¿Aborda temas que preocupan a la sociedad?
- **Originalidad**: ¿Hay algo nunca antes hecho en este género/tema?
- **Autoridad**: ¿El autor tiene credenciales únicas para contar esto?

---

# ESTRUCTURA DEL COMUNICADO (Pirámide Invertida)

## 1. TITULAR (1 línea)
- Periodístico, informativo, con gancho
- Debe funcionar en una bandeja de entrada llena de emails
- Evita titulares genéricos tipo "X presenta su nueva novela"

## 2. SUBTÍTULO/ENTRADILLA (1-2 líneas)
- Amplía el titular con el dato más relevante
- Incluye autor y editorial

## 3. LEAD - Primer párrafo (2-3 frases)
- Responde a las 5W: Qué, Quién, Cuándo, Dónde, Por qué
- La información más importante primero
- Un periodista debe poder usar este párrafo tal cual

## 4. CUERPO (3-4 párrafos)
**Párrafo 2 - La obra:**
- De qué trata sin spoilers
- Por qué es relevante ahora
- Qué la hace diferente

**Párrafo 3 - El autor:**
- Trayectoria relevante (no un CV completo)
- Por qué está cualificado para escribir esto
- Datos que generen interés (premios, ventas, reconocimientos)

**Párrafo 4 - Contexto:**
- Conexión con el momento cultural actual
- Tendencias literarias en las que se inscribe
- A quién interesará y por qué

## 5. CITA DEL AUTOR (1 párrafo)
- Entrecomillada y atribuida: «...», declara [Autor]
- Debe sonar natural, no promocional
- Aportar un ángulo personal, emotivo o revelador
- Que sea "citeable" por otros medios

## 6. INFORMACIÓN PRÁCTICA
- "*Título* está disponible en librerías y plataformas digitales."
- Si hay URLs de imágenes disponibles, inclúyelas al final: "Imágenes de prensa disponibles en: [URL]"

## 7. BOILERPLATE + CONTACTO
- Si hay nombre de editorial: párrafo breve describiéndola profesionalmente
- Contacto: "Para entrevistas y más información: prensa@[editorial].com"

---

# MEDIOS OBJETIVO

Este comunicado debe funcionar para:
- **Suplementos culturales**: Babelia, El Cultural, ABC Cultural
- **Revistas especializadas**: Quimera, Zenda, Letras Libres
- **Secciones de cultura de diarios**: generalistas que necesitan contexto
- **Medios latinoamericanos**: si el tema tiene alcance internacional

---

# ESTILO OBLIGATORIO

- ✅ Estructura de pirámide invertida (lo más importante primero)
- ✅ Tono: profesional, informativo, periodístico
- ✅ Tercera persona
- ✅ Frases cortas, párrafos breves
- ✅ Cursivas (*título*) para mencionar obras
- ✅ Datos concretos sobre afirmaciones vagas

- ❌ NO uses lenguaje promocional ("increíble", "imprescindible", "fascinante")
- ❌ NO uses construcciones "no es [A], sino [B]"
- ❌ NO uses jerga que un periodista generalista no entienda
- ❌ NO incluyas opiniones sin atribuir a alguien
- ❌ NO excedas 700 palabras

## Extensión: 400-700 palabras exactamente.

${NORMAS_ORTOTIPOGRAFICAS}

---

# FORMATO DE SALIDA

⚠️ **CRÍTICO**: El texto debe estar estructurado con saltos de línea dobles (\\n\\n) entre cada párrafo y sección. Cada sección debe comenzar en un nuevo párrafo. NO devuelvas todo el texto en una sola línea continua.
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Limitar el texto para el contexto
      const textSample = data.rawText ?
        data.rawText.substring(0, 50000) : "";

      // Información adicional para preguntas sobre traducciones
      const translationContext = commercialData?.translator ?
        `\n**Traductor/a**: ${commercialData.translator}${commercialData.originalTitle ? `\n**Título original**: ${commercialData.originalTitle}` : ""}` : "";

      const commercialDataSection = formatCommercialData(commercialData);

      const prompt = `
# ROL

Eres un periodista cultural especializado en literatura que prepara entrevistas para una revista literaria de prestigio. Tu trabajo consiste en formular preguntas perspicaces, originales y reveladoras que permitan al autor profundizar en su obra y su proceso creativo.

---

# DATOS DE LA OBRA Y EL AUTOR

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}${translationContext}${commercialDataSection}

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
- NO numeres las preguntas (la numeración se añade automáticamente)

**IMPORTANTE:**
- NO inventes respuestas. Solo genera las preguntas.
- Las respuestas serán proporcionadas por el autor posteriormente.

${NORMAS_ORTOTIPOGRAFICAS}
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
      description: "Texto de solapa/contraportada (150-200 palabras). " +
        "IMPORTANTE: Usa dos saltos de línea (\\n\\n) entre cada párrafo " +
        "para mantener el formato estructurado.",
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Información de colección si está disponible
      const collectionInfo = commercialData?.collection ?
        `\n**Colección**: ${commercialData.collection}` : "";

      const commercialDataSection = formatCommercialData(commercialData);

      const prompt = `
# ROL: COPYWRITER EDITORIAL DE ALTO IMPACTO

Eres un especialista senior en copywriting editorial con experiencia en el sector del libro en España y Latinoamérica. Tu objetivo es crear un texto de solapa/contraportada que convenza al lector de comprar el libro en los pocos segundos que dedica a leerlo en una librería.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}${collectionInfo}
**Sinopsis completa**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}${commercialDataSection}

---

# PRINCIPIOS FUNDAMENTALES DE COPYWRITING EDITORIAL

Aplica estos 5 principios en cada frase:

1. **Primera frase = DECISIVA** → El lector decide en 3 segundos si sigue leyendo
2. **Verbos activos, tiempo presente narrativo** → Genera inmediatez
3. **Especificidad > Generalidad** → "Una aldea asturiana en 1936" mejor que "un pueblo durante la guerra"
4. **Emoción concreta > Emoción abstracta** → "El miedo a perder a su hija" mejor que "el miedo"
5. **Promesa implícita de experiencia lectora** → El lector debe intuir qué sentirá al leerlo

---

# ESTRUCTURA DEL TEXTO (150-200 palabras)

1. **GANCHO EMOCIONAL** (1-2 frases)
   - Abre con algo que atrape inmediatamente
   - Puede ser una pregunta retórica, una afirmación impactante, o una imagen potente

2. **CONFLICTO CENTRAL** (2-3 frases)
   - Presenta la premisa sin revelar demasiado
   - Genera tensión narrativa: qué está en juego

3. **PROMESA DE LECTURA** (1-2 frases)
   - Cierra con lo que el lector obtendrá
   - Invita sin imperativos, sugiere sin prometer

---

# PROHIBICIONES ABSOLUTAS

- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses imperativos ("descubre", "adéntrate", "sumérgete", "prepárate")
- ❌ NO uses superlativos vacíos ("extraordinario", "imprescindible", "magistral", "fascinante")
- ❌ NO uses frases hechas ("un viaje", "una historia que cambiará...", "te atrapará desde la primera página")
- ❌ NO menciones premios ni credenciales del autor
- ❌ NO uses palabras como "apasionante", "conmovedor", "inolvidable"
- ❌ NO termines con preguntas retóricas vacías

---

# ADAPTACIÓN POR GÉNERO

- **Thriller/Suspense**: Tensión, amenaza, cuenta atrás
- **Romance**: Emoción, deseo, obstáculos al amor
- **Literaria**: Atmósfera, voz, belleza del lenguaje
- **Ensayo/No ficción**: Relevancia, urgencia, lo que aprenderás
- **Histórica**: Época vívida, destinos cruzados, ecos del presente

**Extensión:** Exactamente entre 150 y 200 palabras.

${NORMAS_ORTOTIPOGRAFICAS}
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Información de lanzamiento para RRSS
      const launchDetails: string[] = [];
      if (commercialData?.publisher) {
        launchDetails.push(`**Editorial**: ${commercialData.publisher}`);
      }
      if (commercialData?.publicationDate) {
        const date = new Date(commercialData.publicationDate);
        launchDetails.push(`**Fecha de lanzamiento**: ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long", day: "numeric"})}`);
      }
      if (commercialData?.price && commercialData?.currency) {
        const symbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
        launchDetails.push(`**PVP**: ${commercialData.price} ${symbols[commercialData.currency] || commercialData.currency}`);
      }
      if (commercialData?.collection) {
        launchDetails.push(`**Colección**: ${commercialData.collection}`);
      }
      if (commercialData?.translator) {
        launchDetails.push(`**Traducción de**: ${commercialData.translator}`);
      }
      if (commercialData?.originalTitle) {
        launchDetails.push(`**Título original**: ${commercialData.originalTitle}`);
      }
      const launchInfo = launchDetails.length > 0 ?
        `\n${launchDetails.join("\n")}` : "";

      // URLs de imágenes para uso en RRSS
      const imageUrls: string[] = [];
      if (commercialData?.coverImageUrl) {
        imageUrls.push(`**URL de portada**: ${commercialData.coverImageUrl}`);
      }
      if (commercialData?.authorPhotoUrl) {
        imageUrls.push(`**URL foto del autor**: ${commercialData.authorPhotoUrl}`);
      }
      const imageSection = imageUrls.length > 0 ?
        `\n\n**MATERIAL VISUAL DISPONIBLE**\n${imageUrls.join("\n")}\n(Usar estas URLs para crear contenido visual)` : "";

      const prompt = `
# ROL

Eres un especialista en marketing editorial digital con experiencia en estrategias de contenido para redes sociales. Combinas conocimiento del sector del libro con técnicas de copywriting para crear contenido que conecta emocionalmente con los lectores sin caer en la promoción agresiva.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Etiquetas**: ${data.tags.join(", ")}${launchInfo}${imageSection}

---

# ESTRATEGIA DE CONTENIDO RRSS

## PRINCIPIOS FUNDAMENTALES

1. **Valor antes que venta**: El contenido debe aportar algo (emoción, reflexión, curiosidad) antes de pedir la compra
2. **Adaptación al algoritmo**: Formatos nativos de cada plataforma para maximizar alcance orgánico
3. **Hooks psicológicos efectivos**:
   - Curiosidad: "¿Alguna vez te has preguntado...?"
   - Identificación: "Si eres de los que..."
   - Contraste: Expectativa vs realidad (sin la estructura prohibida)
   - Urgencia sutil: Novedad, temporada, actualidad

## OBJETIVOS POR PLATAFORMA

- **Twitter/X**: AWARENESS - Viralidad y alcance, engagement rápido
- **Instagram**: ENGAGEMENT - Comunidad, conexión emocional, guardados
- **Facebook**: ENGAGEMENT - Conversación, shares en grupos de lectura
- **LinkedIn**: AWARENESS/CONVERSION - Credibilidad profesional, prescripción

---

# INSTRUCCIONES POR PLATAFORMA

## 1. TWITTER/X (máximo 280 caracteres)

**Objetivo**: Crear tweet viral que genere retweets y clics

**Estructura efectiva** (elige una):
- HOOK + PROMESA: Gancho que detiene el scroll + beneficio implícito
- PREGUNTA RETÓRICA: Que el lector responda mentalmente "sí, yo"
- DATO SORPRENDENTE: Si el libro tiene un ángulo de actualidad o curiosidad
- CITA BREVE: Si hay una frase potente del libro (máximo 100 caracteres)

**Formato**:
- Primera línea = gancho (80% del trabajo)
- 1-2 emojis estratégicos (no decorativos)
- 2 hashtags máximo (uno de nicho, uno genérico)
- Mención de título en cursiva (*Título*)

**Nota**: Genera también una ALTERNATIVA para hilo (3 tweets conectados) si el contenido lo amerita.

## 2. INSTAGRAM (200-350 palabras)

**Objetivo**: Generar guardados y comentarios que impulsen el algoritmo

**Estructura AIDA adaptada**:
1. **HOOK** (primera línea visible antes del "ver más"): Pregunta, afirmación provocadora o dato
2. **DESARROLLO**: Historia, contexto o desarrollo emocional
3. **VALOR**: Qué aporta el libro al lector (transformación, conocimiento, placer)
4. **CTA**: Llamada a la acción específica (comentar, guardar, link en bio)

**Formato optimizado**:
- Saltos de línea para legibilidad (frases cortas)
- Emojis como bullets visuales (📚 🔥 ✨), no decoración excesiva
- 5-8 hashtags estratégicos en línea final:
  - 2-3 hashtags de nicho (#novelanegra, #literaturacontemporanea)
  - 2-3 hashtags de volumen medio (#libros, #lectura)
  - 1-2 hashtags de comunidad (#bookstagram, #leeresesvivir)

**BONUS**: Incluye sugerencia para CARRUSEL si el contenido permite desgranar en 5-7 slides (estructura: slide 1 = gancho, slides 2-6 = desarrollo, slide 7 = CTA).

## 3. FACEBOOK (120-200 palabras)

**Objetivo**: Generar shares y comentarios en grupos de lectura

**Estructura para viralidad orgánica**:
1. **Pregunta abierta** o reflexión que invite a opinar
2. **Presentación breve** del libro como respuesta o propuesta
3. **Invitación a la comunidad**: "¿Vosotros qué opináis?" / "¿Lo habéis leído?"

**Tono**: Conversacional, como una recomendación entre amigos lectores

**Formato**:
- Sin hashtags o máximo 1-2
- Emojis moderados
- Puede incluir pregunta al final para engagement

## 4. LINKEDIN (180-280 palabras)

**Objetivo**: Posicionar como lectura relevante para profesionales

**Estructura de valor profesional**:
1. **CONTEXTO**: Tendencia, problema o reflexión del sector/sociedad
2. **EL LIBRO COMO RECURSO**: Cómo aporta perspectiva o conocimiento
3. **PARA QUIÉN**: Profesionales que se beneficiarían
4. **CREDENCIALES**: Mención sutil al autor si tiene trayectoria relevante

**Tono**: Profesional pero accesible, evitar academicismo

**Formato**:
- Sin emojis o máximo 1-2 muy sutiles
- 3-4 hashtags profesionales (#Liderazgo, #Cultura, #Innovación según tema)
- Puede mencionar "Recomendación de lectura" como formato reconocible

---

# RESTRICCIONES ABSOLUTAS (TODAS LAS PLATAFORMAS)

- ❌ NO uses construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ NO uses superlativos vacíos ("extraordinario", "imprescindible", "imperdible")
- ❌ NO uses lenguaje de vendedor agresivo ("No te lo pierdas", "Corre a comprarlo")
- ❌ NO uses clichés de IA ("En un mundo donde...", "¿Estás listo para...?")
- ❌ NO abuses de los emojis (máximo 5-6 por post, distribuidos)
- ✅ SÍ menciona el título siempre en cursiva: *Título*
- ✅ SÍ adapta el tono al género: thriller (intriga), romance (emoción), ensayo (reflexión)
- ✅ SÍ prioriza autenticidad sobre perfección formal

${NORMAS_ORTOTIPOGRAFICAS}
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Ficha técnica comercial
      const technicalDetails: string[] = [];
      if (commercialData?.publisher) {
        technicalDetails.push(`**Editorial**: ${commercialData.publisher}`);
      }
      if (commercialData?.isbn) {
        technicalDetails.push(`**ISBN**: ${commercialData.isbn}`);
      }
      if (commercialData?.pages) {
        technicalDetails.push(`**Páginas**: ${commercialData.pages}`);
      }
      if (commercialData?.format) {
        const formatLabels: Record<string, string> = {
          hardcover: "Cartoné",
          paperback: "Rústica",
          ebook: "eBook",
          audiobook: "Audiolibro",
        };
        technicalDetails.push(`**Formato**: ${formatLabels[commercialData.format] || commercialData.format}`);
      }
      if (commercialData?.price && commercialData?.currency) {
        const symbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
        technicalDetails.push(`**PVP**: ${commercialData.price} ${symbols[commercialData.currency] || commercialData.currency}`);
      }
      if (commercialData?.publicationDate) {
        const date = new Date(commercialData.publicationDate);
        technicalDetails.push(`**Fecha publicación**: ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long"})}`);
      }
      if (commercialData?.collection) {
        technicalDetails.push(`**Colección**: ${commercialData.collection}`);
      }
      if (commercialData?.translator) {
        technicalDetails.push(`**Traducción de**: ${commercialData.translator}`);
      }
      if (commercialData?.originalTitle) {
        technicalDetails.push(`**Título original**: ${commercialData.originalTitle}`);
      }

      const technicalSection = technicalDetails.length > 0 ?
        `\n\n**FICHA TÉCNICA**\n${technicalDetails.join("\n")}` : "";

      // URLs de imágenes disponibles
      const imageUrls: string[] = [];
      if (commercialData?.coverImageUrl) {
        imageUrls.push(`**Portada**: ${commercialData.coverImageUrl}`);
      }
      if (commercialData?.authorPhotoUrl) {
        imageUrls.push(`**Foto del autor**: ${commercialData.authorPhotoUrl}`);
      }
      const imageSection = imageUrls.length > 0 ?
        `\n\n**MATERIAL GRÁFICO DISPONIBLE**\n${imageUrls.join("\n")}` : "";

      const prompt = `
# ROL: DIRECTOR COMERCIAL EDITORIAL

Eres el director comercial de una editorial con 20 años de experiencia en el sector del libro en España y Latinoamérica. Tu trabajo es preparar argumentarios de venta profesionales que ayuden al equipo comercial a presentar y vender libros a librerías, distribuidores y clientes.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Etiquetas**: ${data.tags.join(", ")}
**Extensión**: ${data.wordCount.toLocaleString("es-ES")} palabras${technicalSection}${imageSection}

---

# ESTRUCTURA DEL ARGUMENTARIO PROFESIONAL

## 1. EL LIBRO EN UNA FRASE
Elevator pitch de **máximo 15 palabras**. Una sola idea potente que capte la esencia comercial del libro.

## 2. PÚBLICO OBJETIVO (Segmentación precisa)

### LECTOR PRIMARIO (60% de ventas esperadas)
- **Perfil**: Descripción en 2-3 líneas (demografía + psicografía)
- **Motivación de compra**: Qué busca en este libro
- **Dónde encontrarlo**: Canales, comunidades, espacios
- **Mensaje clave**: Qué decirle para que compre

### LECTOR SECUNDARIO (25% de ventas esperadas)
- Mismo esquema que el primario

### PRESCRIPTOR (15% de influencia)
- Libreros, críticos, bookstagrammers, profesores que lo recomendarán

## 3. GANCHOS DE VENTA (5 puntos máximo)
Argumentos ordenados por potencia comercial. Cada punto debe ser:
- **Afirmación + Evidencia/Razón**
- Enfocados en beneficios, no características
- Variados: emocionales, racionales, de autoridad, de urgencia

## 4. ELEMENTOS DIFERENCIADORES (3-5 puntos)
Qué hace único a este libro frente a la competencia:
- Enfoque o perspectiva única
- Credenciales del autor
- Formato o estructura innovadora
- Comparables: 2-3 títulos de éxito con los que dialoga (justifica la comparación: tono, público, momento)

## 5. CONTEXTO DE OPORTUNIDAD
- Efemérides, tendencias, debates actuales que favorecen el título
- Estacionalidad si aplica (Sant Jordi, Navidad, verano, rentrée)
- Adaptaciones audiovisuales, premios, eventos relacionados

## 6. MANEJO DE OBJECIONES (3-4 puntos)
Formato: **"Objeción típica" → Respuesta preparada**
- "Es un autor desconocido" → [Respuesta]
- "El tema es difícil" → [Respuesta]
- "Ya hay muchos libros sobre esto" → [Diferenciación]
- "No creo que se venda bien" → [Evidencia de potencial]

## 7. ELEVATOR PITCH COMPLETO
Resumen de 30 segundos (3-4 frases) para captar interés inmediato. Debe incluir:
- Qué es el libro
- Para quién es
- Por qué ahora

---

# ESTILO OBLIGATORIO

- ✅ Lenguaje comercial directo y persuasivo
- ✅ Datos concretos cuando sea posible
- ✅ Enfocado en resultados y beneficios
- ✅ Cada afirmación debe ser defendible ante un librero escéptico
- ❌ NO uses construcciones "no es [A], sino [B]"
- ❌ NO uses superlativos vacíos sin justificación ("el mejor", "imprescindible")
- ❌ NO prometas resultados que no puedas fundamentar

${NORMAS_ORTOTIPOGRAFICAS}
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
      description: "Cuerpo del email (300-400 palabras). IMPORTANTE: Usa " +
        "dos saltos de línea (\\n\\n) entre cada párrafo para mantener el " +
        "formato estructurado. El email debe tener párrafos claramente " +
        "separados, no texto continuo.",
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
      const commercialData = request.body.commercialData as CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Datos comerciales esenciales para el librero
      const commercialInfo: string[] = [];
      if (commercialData?.publisher) {
        commercialInfo.push(`**Editorial**: ${commercialData.publisher}`);
      }
      if (commercialData?.isbn) {
        commercialInfo.push(`**ISBN**: ${commercialData.isbn}`);
      }
      if (commercialData?.price && commercialData?.currency) {
        const symbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
        commercialInfo.push(`**PVP**: ${commercialData.price} ${symbols[commercialData.currency] || commercialData.currency}`);
      }
      if (commercialData?.pages) {
        commercialInfo.push(`**Páginas**: ${commercialData.pages}`);
      }
      if (commercialData?.format) {
        const formatLabels: Record<string, string> = {
          hardcover: "Cartoné",
          paperback: "Rústica",
          ebook: "eBook",
          audiobook: "Audiolibro",
        };
        commercialInfo.push(`**Formato**: ${formatLabels[commercialData.format] || commercialData.format}`);
      }
      if (commercialData?.publicationDate) {
        const date = new Date(commercialData.publicationDate);
        commercialInfo.push(`**Disponibilidad**: ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long"})}`);
      }
      if (commercialData?.collection) {
        commercialInfo.push(`**Colección**: ${commercialData.collection}`);
      }
      if (commercialData?.translator) {
        commercialInfo.push(`**Traducción de**: ${commercialData.translator}`);
      }
      if (commercialData?.originalTitle) {
        commercialInfo.push(`**Título original**: ${commercialData.originalTitle}`);
      }

      const commercialSection = commercialInfo.length > 0 ?
        `\n\n**FICHA COMERCIAL**\n${commercialInfo.join("\n")}` : "";

      // URLs de imágenes para incluir en el email
      const imageUrls: string[] = [];
      if (commercialData?.coverImageUrl) {
        imageUrls.push(`**Portada**: ${commercialData.coverImageUrl}`);
      }
      if (commercialData?.authorPhotoUrl) {
        imageUrls.push(`**Foto del autor**: ${commercialData.authorPhotoUrl}`);
      }
      const coverInfo = imageUrls.length > 0 ?
        `\n\n**IMÁGENES PARA ADJUNTAR**\n${imageUrls.join("\n")}` : "";

      const prompt = `
# ROL

Eres un especialista en comunicación comercial B2B del sector editorial. Combinas conocimiento profundo del negocio librero con técnicas de venta consultiva para crear emails que respetan el tiempo del librero mientras demuestran claramente el potencial comercial de cada título.

---

# DATOS DE LA OBRA

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Sinopsis**: ${data.synopsis}
**Biografía del autor**: ${data.authorBio}
**Etiquetas**: ${data.tags.join(", ")}${commercialSection}${coverInfo}

---

# MARCO ESTRATÉGICO B2B

## PRINCIPIOS DE COMUNICACIÓN LIBRERO

1. **Tiempo es dinero**: Los libreros reciben decenas de emails diarios. Cada segundo que dedican a leer el tuyo es una inversión. Recompénsalo con información útil y clara.

2. **Mentalidad de socio comercial**: No vendes un libro; propones una oportunidad de negocio mutuo. El libro solo es exitoso si rota en sus mesas.

3. **Argumentos de negocio > Argumentos literarios**: Al librero le importa menos la calidad literaria abstracta que:
   - ¿Hay demanda para este género/tema?
   - ¿El autor tiene base de seguidores?
   - ¿Encaja con mi clientela habitual?
   - ¿Hay campaña de promoción que lo apoye?

4. **Diferenciación en mesa**: El libro compite por espacio físico limitado. ¿Por qué ESTE libro merece un hueco?

## SEGMENTACIÓN DE LIBRERÍAS (adaptar tono)

- **Librería generalista**: Enfatizar potencial de público amplio, rotación
- **Librería especializada**: Enfatizar autoridad del autor, profundidad del tema
- **Gran superficie/cadena**: Enfatizar campaña, comparables de éxito, volumen
- **Librería independiente/curada**: Enfatizar singularidad, prescripción, exclusividad

---

# INSTRUCCIONES

Genera un email de presentación profesional siguiendo esta estructura:

## ASUNTO (máximo 60 caracteres)

**Opciones efectivas**:
- Novedad + título: "Novedad [MES]: *Título*"
- Género + gancho: "[Género] que arrasa en [mercado/país]"
- Autor + credencial: "Nuevo de [Autor] – [credencial breve]"
- Oportunidad: "Para su mesa de [temporada/tema]"

**Evitar**: Palabras spam, mayúsculas excesivas, puntuación agresiva (!!!)

## CUERPO DEL EMAIL (350-450 palabras)

### 1. SALUDO (1 línea)
- "Estimado/a librero/a" o "Estimado equipo de [si conocemos la librería]"
- Evitar el genérico "A quien corresponda"

### 2. APERTURA DE IMPACTO (2-3 líneas)
**Elige el hook más relevante**:
- **Comparables**: "Si *[libro exitoso]* funcionó en su librería, le interesará..."
- **Tendencia**: "El [género/tema] está en auge, y *Título* llega en el momento justo"
- **Autor establecido**: "[Autor] vuelve con su esperada nueva obra"
- **Novedad diferencial**: "Una propuesta que no encontrará en otro catálogo"

### 3. EL LIBRO EN 30 SEGUNDOS (1 párrafo, 60-80 palabras)
- Sinopsis COMERCIAL (no literaria): qué es, para quién, qué ofrece
- Traducir virtudes literarias a argumentos de venta:
  - "Prosa exquisita" → "Ideal para lectores exigentes que buscan calidad"
  - "Trama trepidante" → "Engancha desde la primera página, genera recomendaciones"
  - "Tema de actualidad" → "Conecta con el debate público, atrae público nuevo"

### 4. POR QUÉ ESTE AUTOR (3-4 líneas)
- Credenciales VENDIBLES: premios, ventas anteriores, presencia mediática
- Base de seguidores (si tiene): redes sociales, newsletter, comunidad
- Trayectoria breve si es relevante
- Si es debut, enfatizar descubrimiento y frescura

### 5. ARGUMENTOS COMERCIALES (4-5 bullets)
**Estructura: [BENEFICIO] + [EVIDENCIA]**

Ejemplos de argumentos potentes:
- 📈 **Tendencia**: "[Género] creció un X% en [año] según [fuente]"
- 👥 **Público definido**: "Conecta con lectores de [autor comparable] y [otro]"
- 📣 **Campaña activa**: "Apoyado con [acciones: prensa, RRSS, eventos]"
- 🏆 **Reconocimiento**: "[Premio, selección, mención destacada]"
- 🌍 **Éxito internacional**: "Best-seller en [países] con [X] ejemplares vendidos"
- 📅 **Oportunidad estacional**: "Ideal para [Navidad/verano/Sant Jordi/temática del momento]"

### 6. LLAMADA A LA ACCIÓN (2-3 líneas)
- Invitación concreta: solicitar ejemplares, pedir material
- Ofrecer: información adicional, argumentario comercial, condiciones
- Facilitar: "Responda a este email" o "Contacte en [teléfono]"

### 7. CIERRE PROFESIONAL
- Agradecimiento por el tiempo
- Firma con placeholders: [NOMBRE], [CARGO], [EDITORIAL]
- Espacio para datos de contacto

---

# ESTILO Y RESTRICCIONES

**HACER:**
- ✅ Tono profesional pero cálido (somos socios, no vendedor vs cliente)
- ✅ Orientar SIEMPRE a beneficios para el negocio del librero
- ✅ Estructura escaneable: bullets, negritas para conceptos clave
- ✅ Título siempre en cursiva: *Título*
- ✅ Datos concretos cuando sea posible (cifras, fechas, nombres)

**NO HACER:**
- ❌ Construcciones "no es [A], sino [B]" / "no solo [A], también [B]"
- ❌ Superlativos vacíos ("obra maestra", "imprescindible", "joya")
- ❌ Presión agresiva ("no se lo pierda", "última oportunidad")
- ❌ Promesas imposibles de cumplir
- ❌ Emails de más de 500 palabras (se abandonan antes de terminar)

${NORMAS_ORTOTIPOGRAFICAS}

---

# FORMATO DE SALIDA

⚠️ **CRÍTICO**: El cuerpo del email debe estar estructurado con saltos de línea dobles (\\n\\n) entre cada párrafo. Cada sección (saludo, apertura, descripción, cierre) debe ser un párrafo separado. NO devuelvas todo el texto en una sola línea continua.
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
  {
    cors: true,
    secrets: [geminiApiKey],
    timeoutSeconds: 180, // 3 minutos para informes de lectura extensos
    memory: "512MiB",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const data = request.body.data as AnalysisResult;
      const commercialData = request.body.commercialData as
        CommercialData | undefined;
      if (!data) {
        response.status(400)
          .send("Bad Request: Se requiere el objeto 'data'.");
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Usar más texto para un análisis más profundo
      const textSample = data.rawText ?
        data.rawText.substring(0, 80000) : "";

      // Contexto adicional para el informe si es traducción
      let contextSection = "";
      if (commercialData) {
        const contextParts: string[] = [];
        if (commercialData.originalTitle) {
          contextParts.push(`**Título original**: ${
            commercialData.originalTitle}`);
        }
        if (commercialData.translator) {
          contextParts.push(`**Traductor/a**: ${commercialData.translator}`);
        }
        if (commercialData.collection) {
          contextParts.push(`**Colección destino**: ${
            commercialData.collection}`);
        }
        if (commercialData.pages) {
          contextParts.push(`**Extensión estimada**: ${
            commercialData.pages} páginas`);
        }
        if (contextParts.length > 0) {
          contextSection = "\n" + contextParts.join("\n");
          // Añadir nota si es traducción
          if (commercialData.originalTitle || commercialData.translator) {
            contextSection += "\n\n*NOTA: Esta obra es una traducción. " +
              "Ten en cuenta este factor en tu análisis de mercado y " +
              "recomendación.*";
          }
        }
      }

      const prompt = `
# ROL

Eres un lector editorial senior con 20 años de experiencia evaluando manuscritos para una editorial literaria de prestigio. Tu trabajo es elaborar informes de lectura internos que ayuden al comité editorial a decidir sobre la publicación de obras.

Tu informe debe ser honesto, riguroso y profesional. No estás escribiendo para el autor ni para el público, sino para editores que necesitan tomar decisiones de inversión.

---

# MANUSCRITO A EVALUAR

**Título**: ${data.title}
**Autor**: ${data.authorName}
**Número de palabras**: ${data.wordCount.toLocaleString("es-ES")}${contextSection}
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

${NORMAS_ORTOTIPOGRAFICAS}
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

// ============================================================================
// GHOST BLOG INTEGRATION
// ============================================================================

const ghostArticleSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Título atractivo para el artículo del blog (máx 60 caracteres)",
    },
    excerpt: {
      type: Type.STRING,
      description: "Extracto/descripción breve para SEO (máx 160 caracteres)",
    },
    article: {
      type: Type.STRING,
      description: "El artículo/reseña completo en formato HTML",
    },
  },
  required: ["title", "excerpt", "article"],
};

export const publishToGhost = onRequest(
  {cors: true, secrets: [geminiApiKey, ghostAdminApiKey]},
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

Eres un crítico literario y periodista cultural que escribe para un blog literario de prestigio. Tu estilo es accesible, ameno y cautivador. Evitas el tono académico o excesivamente formal. Escribes para atraer lectores y generar interés por el libro.

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

Genera una reseña literaria para publicar en el blog de la editorial con las mejores prácticas de marketing editorial.

## IMPORTANTE - Formato de salida:

1. **title**: Un título atractivo y SEO-friendly para el artículo (máximo 60 caracteres). NO uses el título del libro directamente, crea un título editorial atractivo.

2. **excerpt**: Un extracto de 1-2 frases que resuma el artículo para SEO (máximo 160 caracteres).

3. **article**: La reseña completa en **formato HTML** (800-1200 palabras). Usa:
   - <p> para párrafos
   - <em> para títulos de obras
   - <strong> para énfasis
   - <blockquote> para citas destacadas
   - <h2> para subtítulos si es necesario

## Estructura de la reseña:

1. **Apertura cautivadora** - Gancho que atrape al lector
2. **Análisis de la obra** - Temas, puntos fuertes, pasajes destacables
3. **Contexto literario** - Sitúa la obra en el panorama actual
4. **Valores y aportación** - Por qué merece la pena leerlo
5. **Cierre memorable** - Invitación a la lectura

## Estilo:

- ✅ Tono ameno, persuasivo, periodístico cultural
- ✅ Orientado a marketing editorial y atracción de lectores
- ✅ Usa <em> para títulos de obras
- ❌ NO uses tono académico
- ❌ NO reveles spoilers ni el final
- ❌ NO uses superlativos vacíos
`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: ghostArticleSchema,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta de la API está vacía.");
      }

      const articleData = JSON.parse(geminiResponse.text);

      // Generar JWT para Ghost
      const token = generateGhostJWT(ghostAdminApiKey.value());

      // Crear el post en Ghost como borrador
      const ghostResponse = await fetch(
        `${GHOST_API_URL}/ghost/api/admin/posts/?source=html`,
        {
          method: "POST",
          headers: {
            "Authorization": `Ghost ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            posts: [{
              title: articleData.title,
              html: articleData.article,
              custom_excerpt: articleData.excerpt,
              status: "draft",
              tags: [
                {name: "Reseñas"},
                {name: data.authorName},
              ],
            }],
          }),
        }
      );

      if (!ghostResponse.ok) {
        const errorText = await ghostResponse.text();
        console.error("Error de Ghost API:", errorText);
        throw new Error(`Error al publicar en Ghost: ${ghostResponse.status}`);
      }

      const ghostResult = await ghostResponse.json();
      const post = ghostResult.posts[0];

      response.status(200).json({
        success: true,
        postId: post.id,
        postUrl: `${GHOST_API_URL}/ghost/#/editor/post/${post.id}`,
        title: post.title,
        message: "Borrador creado exitosamente en Ghost",
      });
    } catch (error) {
      console.error("Error publicando en Ghost:", error);
      response.status(500).send(
        "Error interno del servidor: No se pudo publicar en Ghost."
      );
    }
  }
);

// ============================================================================
// CHAT CON AGENTE MARKETING EDITOR
// ============================================================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  bookAnalysis: AnalysisResult;
  conversationHistory: ChatMessage[];
  userMessage: string;
  commercialData?: CommercialData;
}

/**
 * Chat con el agente MarketingEditor para generar y refinar contenido editorial.
 * Mantiene contexto del libro analizado y el historial de conversación.
 */
export const chatWithAgent = onRequest(
  {
    cors: true,
    secrets: [geminiApiKey],
    timeoutSeconds: 120, // 2 minutos para respuestas de chat
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Método no permitido");
      return;
    }

    try {
      const {bookAnalysis, conversationHistory, userMessage, commercialData} =
        request.body as ChatRequest;

      if (!bookAnalysis || !userMessage) {
        response.status(400).send(
          "Faltan datos requeridos: bookAnalysis y userMessage son obligatorios."
        );
        return;
      }

      const ai = new GoogleGenAI({apiKey: geminiApiKey.value()});

      // Construir el contexto del libro para el agente
      const bisacMain = bookAnalysis.classifications?.bisac?.main?.[0];
      const themaMain = bookAnalysis.classifications?.thema?.main?.[0];

      // Formatear datos comerciales si están disponibles
      const formatCommercialData = (data?: CommercialData): string => {
        if (!data || Object.keys(data).length === 0) {
          return "No se han proporcionado datos comerciales adicionales.";
        }

        const parts: string[] = [];

        if (data.coverImageUrl) {
          parts.push(`- **Portada:** ${data.coverImageUrl}`);
        }
        if (data.authorPhotoUrl) {
          parts.push(`- **Foto del autor:** ${data.authorPhotoUrl}`);
        }
        if (data.publisher) {
          parts.push(`- **Editorial:** ${data.publisher}`);
        }
        if (data.publicationDate) {
          const date = new Date(data.publicationDate);
          parts.push(`- **Fecha de publicación:** ${date.toLocaleDateString("es-ES", {year: "numeric", month: "long", day: "numeric"})}`);
        }
        if (data.price && data.currency) {
          const currencySymbols: Record<string, string> = {EUR: "€", USD: "$", GBP: "£", MXN: "$"};
          parts.push(`- **PVP:** ${data.price} ${currencySymbols[data.currency] || data.currency}`);
        }
        if (data.isbn) {
          parts.push(`- **ISBN:** ${data.isbn}`);
        }
        if (data.pages) {
          parts.push(`- **Páginas:** ${data.pages}`);
        }
        if (data.format) {
          const formatLabels: Record<string, string> = {
            hardcover: "Cartoné",
            paperback: "Rústica",
            ebook: "eBook",
            audiobook: "Audiolibro",
          };
          parts.push(`- **Formato:** ${formatLabels[data.format] || data.format}`);
        }
        if (data.collection) {
          parts.push(`- **Colección:** ${data.collection}`);
        }
        if (data.originalTitle) {
          parts.push(`- **Título original:** ${data.originalTitle}`);
        }
        if (data.translator) {
          parts.push(`- **Traductor/a:** ${data.translator}`);
        }

        return parts.length > 0 ? parts.join("\n") : "No se han proporcionado datos comerciales adicionales.";
      };

      const bookContext = `
## LIBRO EN ANÁLISIS

**Título:** ${bookAnalysis.title}
**Autor:** ${bookAnalysis.authorName}
**Extensión:** ${bookAnalysis.wordCount} palabras

### Sinopsis
${bookAnalysis.synopsis}

### Clasificación
- **BISAC Principal:** ${bisacMain ? `${bisacMain.code} - ${bisacMain.description}` : "No disponible"}
- **THEMA Principal:** ${themaMain ? `${themaMain.code} - ${themaMain.description}` : "No disponible"}
- **Etiquetas:** ${bookAnalysis.tags?.join(", ") || "No disponible"}

### Biografía del autor
${bookAnalysis.authorBio}

### Datos comerciales
${formatCommercialData(commercialData)}

### Texto bruto disponible
${bookAnalysis.rawText?.substring(0, 10000) || "No disponible"}...
`;

      // Construir el historial de mensajes para Gemini
      const messagesForGemini: Array<{role: string; parts: Array<{text: string}>}> = [];

      // System prompt + contexto del libro como primer mensaje del usuario
      const systemAndContext = `${MARKETING_EDITOR_SYSTEM_PROMPT}

---

${bookContext}

---

Responde siempre en español. Formatea las respuestas usando Markdown para mejor legibilidad.`;

      messagesForGemini.push({
        role: "user",
        parts: [{text: systemAndContext}],
      });

      messagesForGemini.push({
        role: "model",
        parts: [{text: `Entendido. He analizado "${bookAnalysis.title}" de ${bookAnalysis.authorName}. Estoy listo para ayudarte con cualquier material de marketing editorial. ¿Qué necesitas?`}],
      });

      // Añadir historial de conversación previo
      for (const msg of conversationHistory) {
        messagesForGemini.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{text: msg.content}],
        });
      }

      // Añadir el nuevo mensaje del usuario
      messagesForGemini.push({
        role: "user",
        parts: [{text: userMessage}],
      });

      // Llamar a Gemini
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: messagesForGemini,
        config: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });

      if (!geminiResponse.text) {
        throw new Error("La respuesta del agente está vacía.");
      }

      response.status(200).json({
        response: geminiResponse.text,
        tokensUsed: {
          input: geminiResponse.usageMetadata?.promptTokenCount || 0,
          output: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
        },
      });
    } catch (error) {
      console.error("Error en chat con agente:", error);
      response.status(500).send(
        "Error interno del servidor: No se pudo procesar el mensaje."
      );
    }
  }
);
