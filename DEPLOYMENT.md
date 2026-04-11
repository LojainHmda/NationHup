# Deployment Guide — Same PostgreSQL Database

Deploy WholeSale Pro using your existing Neon PostgreSQL database. The app reads `DATABASE_URL` from environment variables.

---

## Option 1: Replit (Recommended)

The project is configured for Replit Autoscale deployment.

### 1. Import to Replit

1. Go to [replit.com](https://replit.com) and sign in
2. Click **Create Repl** → **Import from GitHub** (or upload this folder)
3. Connect your repo or upload the project

### 2. Set Secrets (Same Database)

1. Open **Secrets** in the left sidebar (lock icon)
2. Select **Deployments** (or **App Secrets**) tab
3. Add these secrets — use the values from your local `.env`:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Your Neon PostgreSQL URL (from `.env`) |
| `SESSION_SECRET` | Session encryption key (e.g. `wholesale-secret-key-change-in-production`) |

Optional (for full features):

| Secret | Description |
|--------|-------------|
| `GOOGLE_CREDS_JSON` | Google OAuth / Drive credentials |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder for uploads |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `OPENAI_API_KEY` | OpenAI API key (for AI assistant) |

### 3. Deploy

1. Open **Publishing** in the left sidebar
2. Click **Deploy** (or enable Autoscale)
3. The build runs: `npm ci && npm run build`
4. The app runs: `npm run start`

Your deployed app will use the same PostgreSQL database as local development.

---

## Option 2: Railway

1. Go to [railway.app](https://railway.app) and create a project
2. Connect your GitHub repo or deploy from this folder
3. Add a **Variable**:
   - `DATABASE_URL` = your Neon PostgreSQL URL
   - `SESSION_SECRET` = your session secret
4. Railway will detect the Node app and run `npm run build` + `npm run start`

---

## Option 3: Render

1. Go to [render.com](https://render.com) and create a **Web Service**
2. Connect your repo
3. Build command: `npm ci && npm run build`
4. Start command: `npm run start`
5. Add **Environment Variables**:
   - `DATABASE_URL` = your Neon PostgreSQL URL
   - `SESSION_SECRET` = your session secret

---

## Option 4: Google Cloud Run

Deploy to Cloud Run with your existing Neon PostgreSQL database.

### Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated
- GCP project with billing enabled

### Setup

```bash
# Authenticate
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com containerregistry.googleapis.com
```

### Deploy with Same PostgreSQL (Neon)

```bash
gcloud builds submit --config cloudbuild.yaml . \
  --substitutions="_SERVICE_NAME=shoestockpro,_REGION=us-central1,_DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require"
```

Use your actual `DATABASE_URL` from `.env` (same database as local).

### Optional: Reuse Session Secret

To preserve existing sessions, pass your `SESSION_SECRET`:

```bash
gcloud builds submit --config cloudbuild.yaml . \
  --substitutions="_SERVICE_NAME=shoestockpro,_REGION=us-central1,_DATABASE_URL=postgresql://...,_SESSION_SECRET=your-existing-secret"
```

### Deploy without Database (not recommended)

```bash
gcloud builds submit --config cloudbuild.yaml . \
  --substitutions="_SERVICE_NAME=shoestockpro,_REGION=us-central1"
```

### Verify

```bash
# Service URL
gcloud run services describe shoestockpro --region us-central1 --format='value(status.url)'

# Env vars
gcloud run services describe shoestockpro --region us-central1 --format='yaml(spec.template.spec.containers[0].env)'
```

---

## Required Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Used for session encryption |
| `PORT` | No | Defaults to 5001 |

---

## Verify Deployment

After deploying:

1. Visit your app URL
2. Log in (e.g. `admin` / `admin`)
3. Confirm data from your existing database appears

The same Neon database is used in development and production.
