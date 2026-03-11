# Backend Setup

## Prerequisites
- Node.js 18+
- PostgreSQL 15+ (or Docker)
- Git
- Groq API key

## Install
```bash
cd Backend
npm install
```

## Environment
Create `Backend/.env`:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/story_teller
GROQ_API_KEY=your_groq_key
FRONTEND_URL=http://localhost:5173
```

## Run
```bash
cd Backend
node index.js
```

API base: `http://localhost:3000/api`

## Optional DB with Docker
```bash
cd Backend
docker compose up -d
```
