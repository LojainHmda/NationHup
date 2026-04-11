"""
FastAPI server for the Google ADK Agent
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
from excel_image_agent import image_agent

app = FastAPI(title="Product Image Processor Agent")

# Enable CORS for Node.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "*"],  # Allow your Node.js server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "agent": "Product Image Processor",
        "version": "1.0.0",
        "powered_by": "Google ADK"
    }


@app.post("/process-excel")
async def process_excel(
    file: UploadFile = File(...),
    bucket_name: str = None
):
    """
    Process Excel file to extract images and upload to Google Drive
    
    Args:
        file: Excel file upload
        bucket_name: Optional GCS bucket name
        
    Returns:
        Processing results with image URLs for each product
    """
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            contents = await file.read()
            tmp_file.write(contents)
            tmp_file_path = tmp_file.name
        
        # Process with the agent
        results = image_agent.process_excel_file(
            excel_path=tmp_file_path,
            bucket_name=bucket_name
        )
        
        # Clean up temp file
        os.unlink(tmp_file_path)
        
        return {
            "success": True,
            "filename": file.filename,
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-image")
async def upload_single_image(
    file: UploadFile = File(...),
    sku: str = None,
    bucket_name: str = None
):
    """
    Upload a single product image to Google Cloud Storage
    
    Args:
        file: Image file upload
        sku: Product SKU
        bucket_name: Optional GCS bucket name
        
    Returns:
        Upload result with public URL
    """
    try:
        # Read image data
        image_data = await file.read()
        
        # Generate filename
        filename = f"{sku}.png" if sku else file.filename
        
        # Upload using the agent's tool
        uploader = image_agent.tools[1]
        result = uploader.run(
            image_data=image_data,
            filename=filename,
            bucket_name=bucket_name
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("AGENT_PORT", 8001))
    
    print(f"🤖 Starting Google ADK Agent API on port {port}")
    print(f"📡 API docs available at http://localhost:{port}/docs")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
