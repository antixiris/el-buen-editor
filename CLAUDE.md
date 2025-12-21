# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"El Buen Editor" is an AI-powered editorial assistant that analyzes book manuscripts (PDF/DOCX) to generate metadata for publishing management systems. It extracts/generates: titles, synopses, author biographies, subject classifications (BISAC, THEMA, IBIC), tags, and academic citations.

## Architecture

**Frontend (root directory):** React 19 + TypeScript + Vite
- Single-page app with components defined inline in `App.tsx`
- `services/geminiService.ts` - API client calling Firebase Functions
- `services/utils.ts` - File extraction (PDF.js, Mammoth) and PDF export (jsPDF)
- Uses Tailwind CSS via CDN (configured in index.html, not in repo)

**Backend (`functions/` directory):** Firebase Cloud Functions (Node 22)
- `functions/src/index.ts` - Two HTTP endpoints: `getEditorialAnalysis` and `getTranslation`
- Uses Google Gemini AI (`gemini-2.5-flash`) with structured JSON output schemas
- `functions/src/data/` - Static classification data (materiasIbic.ts, materiasBisac.ts, materiasThema.ts, etiquetas.ts)

## Commands

### Frontend (from root)
```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Production build
```

### Backend (from functions/)
```bash
npm install                    # Install function dependencies
npm run build                  # Compile TypeScript
npm run serve                  # Build + run Firebase emulator
firebase deploy --only functions  # Deploy to production
```

## Configuration

- **Frontend:** Set `GEMINI_API_KEY` in `.env.local` (for local dev only; production uses Firebase)
- **Backend:** API key stored as Firebase secret: `firebase functions:secrets:set GEMINI_API_KEY`
- **Function URLs:** After deploying, update URLs in `services/geminiService.ts` (lines 6-7)

## Key Implementation Details

- The AI analysis prompt in `functions/src/index.ts` truncates input to 100k characters
- Subject classifications must match codes from the static data files - the AI is constrained to choose from these official industry standards
- Markdown italics (`*text*`) are used throughout for book titles in generated text
- Citation placeholders (`[Editorial]`, `[Año]`, `[Ciudad]`) trigger a modal for user input
