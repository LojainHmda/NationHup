# Product Image Processor - Google ADK Agent

This is an intelligent agent built with Google's Agent Development Kit (ADK) that processes Excel files, extracts product images, and uploads them to Google Cloud Storage.

## Features

- 📊 **Excel Processing**: Reads Excel files and extracts product data
- 🖼️ **Image Extraction**: Extracts embedded images from Excel files
- ☁️ **Cloud Upload**: Uploads images to Google Cloud Storage
- 🔗 **Public URLs**: Generates shareable public URLs for all images
- 🤖 **AI-Powered**: Uses Google ADK for intelligent workflow automation

## Setup

### 1. Google Cloud Credentials

You need Google Cloud credentials to use this agent. Two options:

#### Option A: Service Account (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google Cloud Storage API
4. Create a Service Account with "Storage Admin" role
5. Download the JSON key file
6. Set environment variables:

```bash
export GOOGLE_APPLICATION_CREDENTIALS_JSON='<paste your JSON key here>'
export GCS_BUCKET_NAME='your-bucket-name'
```

#### Option B: Application Default Credentials
```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT='your-project-id'
export GCS_BUCKET_NAME='your-bucket-name'
```

### 2. Install Dependencies

Already done via Replit packager:
```bash
pip install google-adk openpyxl pillow google-cloud-storage google-auth
```

### 3. Start the Agent API

```bash
cd agent
python api.py
```

The agent API will run on port 8001 (or set via `AGENT_PORT` env var).

## Usage

### Via API

#### Process Excel File
```bash
curl -X POST "http://localhost:8001/process-excel" \
  -F "file=@/path/to/products.xlsx" \
  -F "bucket_name=my-product-images"
```

#### Upload Single Image
```bash
curl -X POST "http://localhost:8001/upload-image" \
  -F "file=@/path/to/image.png" \
  -F "sku=PROD-123" \
  -F "bucket_name=my-product-images"
```

### Via Command Line

```bash
python excel_image_agent.py /path/to/excel_file.xlsx
```

## API Endpoints

- `GET /` - Health check
- `POST /process-excel` - Process Excel file and upload images
- `POST /upload-image` - Upload a single product image

Full API docs available at: `http://localhost:8001/docs`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service account JSON key (as string) | Yes* |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | Yes |
| `AGENT_PORT` | Port for the agent API (default: 8001) | No |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (if using ADC) | Yes* |

*One of the credential methods is required

## Integration with Node.js App

The agent runs as a separate service that your Node.js app can call:

```javascript
// In your Node.js app
const response = await fetch('http://localhost:8001/upload-image', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Image URL:', result.url);
```

## Troubleshooting

**"Failed to initialize Google Cloud Storage client"**
- Make sure you've set up Google Cloud credentials
- Check that `GOOGLE_APPLICATION_CREDENTIALS_JSON` or Application Default Credentials are configured

**"No images found in Excel file"**
- The Excel file's "Images" column might be empty
- Use the `/upload-image` endpoint to manually upload images instead

**"Permission denied"**
- Ensure your service account has "Storage Admin" or "Storage Object Admin" role
- Check that the bucket exists and is accessible
