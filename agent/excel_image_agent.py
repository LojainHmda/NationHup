"""
Google ADK Agent for Excel Image Processing
This agent extracts images from Excel files and uploads them to Google Drive
"""

import os
from typing import List, Dict
from google.adk import Agent, TextResponse
from google.adk.tools import Tool
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as OpenpyxlImage
from PIL import Image
from io import BytesIO
from google.cloud import storage
from google.oauth2 import service_account
import json


class ExcelImageExtractor(Tool):
    """Tool to extract images from Excel files"""
    
    name = "extract_excel_images"
    description = """
    Extracts images embedded in an Excel file.
    Returns a list of image data (base64) with their positions and associated product SKUs.
    """
    
    def __init__(self):
        super().__init__()
    
    def run(self, excel_file_path: str) -> Dict:
        """
        Extract images from Excel file
        
        Args:
            excel_file_path: Path to the Excel file
            
        Returns:
            Dict with extracted images and metadata
        """
        try:
            workbook = load_workbook(excel_file_path)
            sheet = workbook.active
            
            images = []
            
            # Try to extract embedded images
            if hasattr(sheet, '_images'):
                for idx, img in enumerate(sheet._images):
                    # Get image data
                    img_data = img.ref
                    
                    # Try to find associated SKU (look at row where image is placed)
                    row_idx = img.anchor._from.row if hasattr(img.anchor, '_from') else None
                    sku = None
                    
                    if row_idx:
                        # Find SKU in the same row
                        for cell in sheet[row_idx + 1]:  # +1 because openpyxl is 1-indexed
                            if cell.column == 2:  # Assuming SKU is in column B
                                sku = cell.value
                                break
                    
                    images.append({
                        "index": idx,
                        "sku": sku,
                        "row": row_idx,
                        "data": img_data
                    })
            
            return {
                "success": True,
                "count": len(images),
                "images": images,
                "message": f"Extracted {len(images)} images from Excel file"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to extract images: {str(e)}"
            }


class GoogleDriveUploader(Tool):
    """Tool to upload images to Google Drive"""
    
    name = "upload_to_google_drive"
    description = """
    Uploads images to Google Drive and returns public shareable URLs.
    Requires Google Cloud credentials.
    """
    
    def __init__(self):
        super().__init__()
        self.credentials = None
        self.storage_client = None
    
    def initialize_storage(self):
        """Initialize Google Cloud Storage client"""
        try:
            # Try to use service account credentials from environment
            creds_json = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
            
            if creds_json:
                creds_dict = json.loads(creds_json)
                self.credentials = service_account.Credentials.from_service_account_info(creds_dict)
                self.storage_client = storage.Client(credentials=self.credentials)
            else:
                # Try default credentials
                self.storage_client = storage.Client()
                
            return True
        except Exception as e:
            print(f"Storage initialization error: {e}")
            return False
    
    def run(self, image_data: bytes, filename: str, bucket_name: str = None) -> Dict:
        """
        Upload image to Google Cloud Storage
        
        Args:
            image_data: Image bytes
            filename: Name for the uploaded file
            bucket_name: GCS bucket name (optional, uses env var if not provided)
            
        Returns:
            Dict with upload status and public URL
        """
        try:
            if not self.storage_client:
                if not self.initialize_storage():
                    return {
                        "success": False,
                        "error": "Failed to initialize Google Cloud Storage client"
                    }
            
            # Use environment variable for bucket name if not provided
            if not bucket_name:
                bucket_name = os.getenv('GCS_BUCKET_NAME', 'product-images')
            
            # Get or create bucket
            bucket = self.storage_client.bucket(bucket_name)
            
            # Create blob
            blob = bucket.blob(f"products/{filename}")
            
            # Upload image
            blob.upload_from_string(image_data, content_type='image/png')
            
            # Make public
            blob.make_public()
            
            # Get public URL
            public_url = blob.public_url
            
            return {
                "success": True,
                "url": public_url,
                "filename": filename,
                "bucket": bucket_name,
                "message": f"Successfully uploaded {filename} to Google Cloud Storage"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to upload image: {str(e)}"
            }


class ProductImageProcessor(Agent):
    """
    Google ADK Agent for processing product images from Excel files
    """
    
    def __init__(self):
        super().__init__(
            name="product_image_processor",
            description="""
            I am an intelligent agent that processes Excel files containing product data,
            extracts embedded images, uploads them to Google Drive/Cloud Storage, and
            returns shareable URLs that can be used to update product records.
            """,
            tools=[
                ExcelImageExtractor(),
                GoogleDriveUploader()
            ]
        )
    
    def process_excel_file(self, excel_path: str, bucket_name: str = None) -> Dict:
        """
        Main workflow: Extract images from Excel and upload to Google Drive
        
        Args:
            excel_path: Path to Excel file
            bucket_name: GCS bucket name (optional)
            
        Returns:
            Dict with processed results
        """
        results = {
            "products_processed": [],
            "errors": [],
            "total_images": 0,
            "successful_uploads": 0
        }
        
        # Step 1: Extract images from Excel
        print("📊 Extracting images from Excel...")
        extraction_result = self.tools[0].run(excel_path)
        
        if not extraction_result.get("success"):
            results["errors"].append(f"Extraction failed: {extraction_result.get('error')}")
            return results
        
        results["total_images"] = extraction_result["count"]
        
        # Step 2: Upload each image to Google Drive
        print(f"☁️  Uploading {results['total_images']} images to Google Cloud Storage...")
        
        for img_info in extraction_result.get("images", []):
            try:
                sku = img_info.get("sku", f"product_{img_info['index']}")
                filename = f"{sku}.png"
                
                # Upload image
                upload_result = self.tools[1].run(
                    image_data=img_info["data"],
                    filename=filename,
                    bucket_name=bucket_name
                )
                
                if upload_result.get("success"):
                    results["products_processed"].append({
                        "sku": sku,
                        "image_url": upload_result["url"],
                        "filename": filename
                    })
                    results["successful_uploads"] += 1
                else:
                    results["errors"].append(f"Upload failed for {sku}: {upload_result.get('error')}")
                    
            except Exception as e:
                results["errors"].append(f"Error processing image {img_info.get('index')}: {str(e)}")
        
        return results


# Initialize the agent
image_agent = ProductImageProcessor()


if __name__ == "__main__":
    # Test the agent with a sample Excel file
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python excel_image_agent.py <path_to_excel_file>")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    
    print(f"🤖 Starting Google ADK Agent...")
    print(f"📁 Processing file: {excel_file}")
    
    # Process the Excel file
    results = image_agent.process_excel_file(excel_file)
    
    # Print results
    print(f"\n✅ Processing complete!")
    print(f"   Total images: {results['total_images']}")
    print(f"   Successful uploads: {results['successful_uploads']}")
    print(f"   Errors: {len(results['errors'])}")
    
    if results['products_processed']:
        print(f"\n📦 Processed products:")
        for product in results['products_processed']:
            print(f"   - {product['sku']}: {product['image_url']}")
    
    if results['errors']:
        print(f"\n⚠️  Errors:")
        for error in results['errors']:
            print(f"   - {error}")
