# Backend Setup

> Get the backend running locally in a few steps.

---

## Prerequisites

| Dependency | Version | Required? |
|---|---|---|
| Node.js | 18+ | ✅ Required |
| Git | any | ✅ Required |
| PostgreSQL **or** Docker Desktop | 15+ | ✅ Required |
| Groq API Key | — | ⭐ Recommended |
| Ollama | any | 🔵 Optional |

---

## Steps

### 1 · Install Dependencies

```bash
cd Backend
npm install
```

---

### 2 · Create Environment File

Copy the example `.env` file before editing:

**macOS / Linux**
```bash
cd Backend
cp .env.example .env
```

**Windows — PowerShell**
```powershell
cd Backend
Copy-Item .env.example .env
```

**Windows — Command Prompt**
```bat
cd Backend
copy .env.example .env
```

---

### 3 · Configure `.env`

Open `Backend/.env` and fill in the values below.

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database — keep only one DATABASE_URL in your final .env
DATABASE_URL=postgresql://postgres:vasu@localhost:5431/story_teller

# LLM
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Optional — Ollama local fallback
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```

> ⚠️ Keep only **one** `DATABASE_URL` entry in your final `.env`.

---

### 4 · Database Setup

#### Option A — Docker *(recommended)*

```bash
cd Backend
docker compose up -d
```

Starts Postgres on `localhost:5431` using values from `docker-compose.yml`.

Apply Prisma schema (first-time setup):

```bash
npx prisma migrate deploy
```

#### Option B — Local PostgreSQL

Create a `story_teller` database in your local Postgres instance, then update `DATABASE_URL` in `.env` accordingly.

Then run:

```bash
npx prisma migrate deploy
```

---

### 5 · Ollama Local Model *(optional)*

Skip this step if you don't want local model for fallback.

**Install and pull a model:**
```bash
ollama pull llama3
```

**Start the Ollama server** (if not already running):
```bash
ollama serve
```

**Add to `.env`:**
```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```

---

### 6 · Run the Backend

```bash
cd Backend
npm run dev
```

| | URL |
|---|---|
| API Base | `http://localhost:3000/api` |
| Health Check | `http://localhost:3000/api/health` |

---

## Quick Start

Docker + env + run in one go:

```bash
cd Backend
npm install
cp .env.example .env   # edit this file before continuing
docker compose up -d
npx prisma migrate deploy
npm run dev
```