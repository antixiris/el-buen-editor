# El Buen Editor - Contexto del Proyecto

## Descripción General

**El Buen Editor** es una aplicación web para el análisis editorial de manuscritos. Permite subir documentos (PDF, DOCX, TXT) y genera automáticamente fichas editoriales completas usando IA (Gemini).

**URL de producción**: https://el-buen-editor.web.app

## Stack Tecnológico

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Firebase Functions (Node.js 22, 2nd Gen)
- **Base de datos**: Firebase Firestore
- **Autenticación**: Firebase Auth (Google Sign-In)
- **Hosting**: Firebase Hosting
- **IA**: Google Gemini API (gemini-2.5-flash, gemini-2.0-flash-thinking-exp)

## Estructura del Proyecto

```
el-buen-editor/
├── App.tsx                    # Componente principal, gestión de estado global
├── index.tsx                  # Punto de entrada, AuthProvider wrapper
├── types.ts                   # Tipos TypeScript (AnalysisResult, etc.)
├── components/
│   ├── ActionBar.tsx          # Barra de acciones (PDF, ONIX, Copiar, Traducir)
│   ├── ActivityLog.tsx        # Historial de libros analizados (Firestore)
│   ├── CitationModal.tsx      # Modal para completar datos de citas
│   ├── ContentGeneratorMenu.tsx # (Legacy) Menú desplegable de generadores
│   ├── Disclaimer.tsx         # Aviso legal sobre IA
│   ├── FileUploader.tsx       # Componente de subida de archivos
│   ├── HeaderContentBar.tsx   # Menú horizontal de generación de contenido
│   ├── Loader.tsx             # Spinner de carga
│   ├── LoginScreen.tsx        # Pantalla de login con Google
│   ├── ResultsDisplay.tsx     # Visualización de resultados del análisis
│   ├── TitleModal.tsx         # Modal para editar título
│   └── UserMenu.tsx           # Menú de usuario (avatar, logout)
├── contexts/
│   └── AuthContext.tsx        # Contexto de autenticación con whitelist
├── services/
│   ├── activityLog.ts         # Servicio de logging a Firestore
│   ├── firebase.ts            # Configuración de Firebase
│   ├── geminiService.ts       # Cliente para funciones de Firebase
│   └── utils.ts               # Utilidades (clipboard, formateo, exports)
├── functions/
│   └── src/index.ts           # Firebase Functions (análisis, generadores)
├── firebase.json              # Configuración de Firebase
└── firestore.rules            # Reglas de seguridad de Firestore
```

## Archivos Clave y Líneas Importantes

### `functions/src/index.ts` - Backend (actualizado 27 Dic 2024)
- **Líneas 19-58**: `NORMAS_ORTOTIPOGRAFICAS` - Constante con reglas ortotipográficas
- **Líneas 138-195**: `formatCommercialData()` - Helper para formatear datos comerciales
- **Líneas 476-750**: `getEditorialAnalysis` - Análisis principal del manuscrito
- **Líneas 870-1000**: `getArticleReview` - Generación de reseñas para Ghost
- **Líneas 1000-1200**: `getPressRelease` - Comunicado de prensa
- **Líneas 1209-1340**: `getInterview` - Generación de entrevistas (sin numerar preguntas)
- **Líneas 1370-1500**: `getBackCoverText` - Texto de solapa
- **Líneas 1503-1710**: `getSocialMediaPosts` - Posts para RRSS
- **Líneas 1712-1900**: `getSalesPitch` - Argumentario de ventas
- **Líneas 1900-2100**: `getBookstoreEmail` - Email a libreros
- **Líneas 2150-2360**: `getReadingReport` - Informe de lectura

### `components/HeaderContentBar.tsx` - Menú de Generadores
- **Líneas 25-63**: `menuCategories` - Definición de categorías (Editorial, Comunicación, RRSS)
- **Líneas 83-136**: `handleGenerate` - Switch para cada tipo de contenido
- **Líneas 150-195**: Renderizado de dropdowns

### `contexts/AuthContext.tsx` - Autenticación
- **Líneas 1-10**: Lista de emails autorizados (whitelist)
- **Líneas 30-50**: Verificación en `signInWithGoogle`
- **Líneas 60-80**: Verificación en `onAuthStateChanged`

### `services/utils.ts` - Utilidades
- **Líneas 100-150**: `copyToClipboard` - Copia HTML al portapapeles
- **Líneas 200-250**: `exportToPDF` - Generación de PDF
- **Líneas 300-340**: `exportToONIX` - Exportación ONIX 3.0
- **Líneas 342-391**: `copyInterviewToClipboard` - Formato de entrevista

## Usuarios Autorizados

Solo estos emails pueden acceder a la aplicación:
- `adadelmoralfernandez@gmail.com`
- `lanochedelfugitivo@gmail.com`

La verificación se hace tanto en frontend (AuthContext) como en backend (firestore.rules).

---

## Cambios Realizados - 27 de Diciembre 2024

### 1. Normas Ortotipográficas para Contenido Editorial
**Archivo**: `functions/src/index.ts` (líneas 19-58)

Creada constante `NORMAS_ORTOTIPOGRAFICAS` con reglas obligatorias del español:
- **Cursiva**: Títulos de libros, películas, obras de arte, periódicos, extranjerismos, latinismos, nombres científicos
- **Comillas españolas («»)**: Citas textuales, títulos de capítulos/poemas/artículos
- **Verificación**: Checklist de 4 puntos antes de entregar respuesta

Añadida a TODAS las funciones de generación de contenido:
- `getEditorialAnalysis` (línea 684)
- `getArticleReview` (línea 969)
- `getPressRelease` (línea 1180)
- `getInterview` (línea 1319)
- `getBackCoverText` (línea 1500)
- `getSocialMediaPosts` (línea 1700)
- `getSalesPitch` (línea 1880)
- `getBookstoreEmail` (línea 2090)
- `getReadingReport` (línea 2340)

### 2. Datos Comerciales Completos en Todas las Funciones
**Archivo**: `functions/src/index.ts`

Corregida inconsistencia donde cada función implementaba su propio subconjunto de datos comerciales. Ahora TODAS incluyen:

| Campo | getPressRelease | getBookstoreEmail | getSalesPitch | getSocialMediaPosts |
|-------|-----------------|-------------------|---------------|---------------------|
| coverImageUrl | ✅ | ✅ (añadido) | ✅ (añadido) | ✅ (añadido) |
| authorPhotoUrl | ✅ | ✅ (añadido) | ✅ (añadido) | ✅ (añadido) |
| publisher | ✅ | ✅ | ✅ (añadido) | ✅ (añadido) |
| isbn | ✅ | ✅ | ✅ | ✅ |
| pages | ✅ | ✅ | ✅ | ✅ |
| price | ✅ | ✅ | ✅ | ✅ |
| format | ✅ (añadido) | ✅ | ✅ | ✅ |
| collection | ✅ (añadido) | ✅ | ✅ | ✅ (añadido) |
| translator | ✅ | ✅ (añadido) | ✅ (añadido) | ✅ (añadido) |
| originalTitle | ✅ | ✅ (añadido) | ✅ (añadido) | ✅ (añadido) |

Líneas modificadas:
- `getPressRelease`: 1045-1056 (añadidos format, collection)
- `getBookstoreEmail`: 1950-1969 (añadidos translator, originalTitle, authorPhotoUrl)
- `getSalesPitch`: 1744-1793 (añadidos publisher, translator, originalTitle, imágenes)
- `getSocialMediaPosts`: 1522-1556 (añadidos publisher, collection, translator, originalTitle, imágenes)

### 3. Corrección de Numeración Duplicada en Entrevistas
**Archivo**: `functions/src/index.ts` (línea 1313)

**Problema**: Las preguntas aparecían como "Pregunta 1: 1. ¿...?"
- Backend pedía "Numera las preguntas del 1 al 10" → Gemini incluía "1.", "2."...
- Frontend añadía "Pregunta N:" al mostrar cada elemento del array

**Solución**: Cambiar instrucción a "NO numeres las preguntas (la numeración se añade automáticamente)"

---

## Cambios Realizados - 21 de Diciembre 2024

### 1. Reglas de Seguridad de Firestore
**Archivos**: `firestore.rules`, `firebase.json`

- Creado `firestore.rules` con reglas que verifican whitelist de emails
- Función `isAllowedUser()` valida autenticación + email en lista
- Añadida configuración de firestore en `firebase.json`

### 2. Reorganización del Menú de Generadores
**Archivo**: `components/HeaderContentBar.tsx`

Cambiado de 10 botones horizontales a 3 menús desplegables:
- **Editorial** (violeta): Informe de lectura, Solapa, Comparables
- **Comunicación** (cian): Comunicado, Reseña, Entrevista, Argumentario, Email libreros
- **RRSS** (rosa): Publicaciones, Palabras clave SEO

Características implementadas:
- Cierre automático al clic fuera (useEffect + event listener)
- Estado de carga por categoría (spinner en el botón padre)
- Flecha animada (rotate-180) cuando está abierto

### 3. Extracción de Editorial para Comunicados de Prensa
**Archivo**: `functions/src/index.ts` (líneas 754-773)

- Añadida función `extractPublisher()` que parsea la cita Chicago
- Busca patrón `Ciudad: Editorial, Año` con regex
- El nombre de la editorial se pasa explícitamente en el prompt
- El boilerplate ahora usa el nombre real en vez de inventarlo

### 4. Corrección de Numeración Duplicada en Entrevistas
**Archivo**: `services/utils.ts` (línea 359)

- Cambiado formato de `<b>1.</b>` a `<b>Pregunta 1:</b>`
- Evita que Google Docs active autoformato de listas numeradas

---

## Decisiones Técnicas

### Normas Ortotipográficas Centralizadas (27 Dic 2024)
- **Decisión**: Crear constante `NORMAS_ORTOTIPOGRAFICAS` e inyectarla en todos los prompts
- **Razón**: Evita duplicación de código y garantiza consistencia. Si se añade una regla nueva (ej: versalitas para siglos), se actualiza en un solo lugar
- **Alternativa descartada**: Copiar las normas manualmente en cada prompt

### Datos Comerciales por Función vs Helper Centralizado (27 Dic 2024)
- **Decisión**: Mantener implementación específica por función en lugar de usar `formatCommercialData()` en todas
- **Razón**: Algunas funciones necesitan formateo especializado (ej: "Imágenes para prensa" vs "Material gráfico disponible", sección de traducción con nota especial)
- **Trade-off**: Más código, pero mejor control sobre el contexto de cada función

### Separación de Responsabilidades: Backend vs Frontend (27 Dic 2024)
- **Decisión**: El backend devuelve datos estructurados (arrays), el frontend decide la presentación (numeración, formato)
- **Razón**: Evita duplicaciones como "Pregunta 1: 1." donde ambos numeraban
- **Aplicado en**: `getInterview` (preguntas sin numerar) + `copyInterviewToClipboard` (añade "Pregunta N:")

### Autenticación con Whitelist
- **Decisión**: Verificar emails tanto en frontend como backend
- **Razón**: Seguridad en capas. El frontend da UX inmediata, pero las reglas de Firestore son la verdadera protección

### Menús Desplegables vs Botones Horizontales
- **Decisión**: 3 categorías con dropdowns
- **Razón**: Mejor organización, menos saturación visual, agrupación lógica por departamento (Editorial, Comunicación, RRSS)

### Extracción de Editorial desde Citas
- **Decisión**: Parsear la cita Chicago con regex
- **Razón**: La cita Chicago tiene formato predecible `Ciudad: Editorial, Año`. Más fiable que intentar extraer del texto libre

### Formato de Preguntas en Entrevistas
- **Decisión**: "Pregunta N:" en vez de "N."
- **Razón**: Google Docs detecta "1." como inicio de lista numerada y duplica la numeración al pegar

---

## Próximos Pasos Sugeridos

### Prioritario (detectado en sesión del 27 Dic)
1. [ ] **Persistencia de datos comerciales**: Actualmente solo existen en estado React (se pierden al refrescar). Opciones:
   - localStorage para persistencia local
   - Firestore vinculado al análisis del libro para persistencia permanente
2. [ ] **Refactorizar helper `formatCommercialData()`**: Consolidar la lógica de formateo que ahora está duplicada en cada función
3. [ ] **Añadir más normas ortotipográficas**: Versalitas para siglos (s. XIX), números romanos, abreviaturas

### Mejoras de UX
1. [ ] Añadir indicador de éxito tras copiar al portapapeles (toast notification)
2. [ ] Mostrar preview del contenido generado antes de abrir Google Docs
3. [ ] Modo oscuro

### Funcionalidad
1. [ ] Añadir más usuarios a la whitelist de forma dinámica (panel admin)
2. [ ] Historial de contenido generado (no solo libros analizados)
3. [ ] Exportar análisis completo a Word/DOCX
4. [ ] Comparar dos análisis de versiones diferentes del mismo manuscrito

### Optimización
1. [ ] Code splitting para reducir bundle size (actualmente >1MB)
2. [ ] Cachear resultados de análisis en Firestore
3. [ ] Lazy loading de componentes de generación de contenido

### Infraestructura
1. [ ] Configurar entorno de staging
2. [ ] Añadir tests unitarios para funciones de Firebase
3. [ ] Monitoring con Firebase Performance

---

## Comandos Útiles

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Deploy completo
firebase deploy

# Deploy solo hosting
firebase deploy --only hosting

# Deploy solo funciones
firebase deploy --only functions

# Deploy función específica
firebase deploy --only functions:getPressRelease

# Deploy reglas de Firestore
firebase deploy --only firestore:rules

# Ver logs de funciones
firebase functions:log
```

---

## Configuración de Firebase

**Proyecto**: `el-buen-editor`
**Región de funciones**: `us-central1`

Las funciones usan el secret `GEMINI_API_KEY` configurado en Firebase.
