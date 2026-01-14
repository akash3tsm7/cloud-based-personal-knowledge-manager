import os
import sys
import json
import base64
import logging
from typing import Dict, Any
from openai import OpenAI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("qwen_ocr")

# Qwen API configuration
QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "")

# Detect if using OpenRouter or DashScope based on API key
if QWEN_API_KEY.startswith("sk-or-"):
    # OpenRouter configuration
    QWEN_BASE_URL = "https://openrouter.ai/api/v1"
    QWEN_MODEL = "qwen/qwen-2-vl-72b-instruct"  # OpenRouter's Qwen model
    logger.info("Using OpenRouter API")
else:
    # DashScope configuration
    QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL = "qwen-vl-max-latest"
    logger.info("Using Alibaba DashScope API")

def encode_image_to_base64(image_path: str) -> str:
    """Encode image file to base64 string"""
    try:
        with open(image_path, 'rb') as image_file:
            encoded = base64.b64encode(image_file.read()).decode('utf-8')
            return encoded
    except Exception as e:
        logger.error(f"Failed to encode image: {str(e)}")
        raise

def extract_text_from_image(image_path: str, api_key: str = None) -> Dict[str, Any]:
    """
    Extract text from image using Qwen VL API
    
    Args:
        image_path: Path to the image file
        api_key: Qwen API key (optional, uses env var if not provided)
    
    Returns:
        Dict with extracted text and metadata
    """
    try:
        # Validate inputs
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Use provided API key or environment variable
        key = api_key or QWEN_API_KEY
        if not key:
            raise ValueError("QWEN_API_KEY not found. Please set it in environment variables or pass it as argument.")
        
        logger.info(f"Processing image: {image_path}")
        logger.info(f"File size: {os.path.getsize(image_path):,} bytes")
        
        # Encode image to base64
        image_base64 = encode_image_to_base64(image_path)
        
        # Determine image format
        ext = os.path.splitext(image_path)[1].lower()
        mime_type = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }.get(ext, 'image/jpeg')
        
        logger.info(f"Detected image type: {mime_type}")
        
        # Initialize OpenAI client with appropriate endpoint
        client = OpenAI(
            api_key=key,
            base_url=QWEN_BASE_URL
        )
        
        logger.info(f"Using model: {QWEN_MODEL}")
        logger.info(f"API endpoint: {QWEN_BASE_URL}")
        
        # Prepare the prompt for OCR
        prompt = """Extract ALL text from this image. Include:
- All visible text, regardless of size or position
- Text in any language (English, Chinese, etc.)
- Numbers, dates, and special characters
- Text in tables, lists, or structured formats
- Watermarks or small text

Format the output as plain text, preserving the reading order (top to bottom, left to right).
If there is no text in the image, respond with: [NO TEXT DETECTED]"""

        logger.info("Calling Qwen VL API...")
        
        # Make API call with timeout handling
        import time
        start_time = time.time()
        
        try:
            completion = client.chat.completions.create(
                model=QWEN_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_base64}"
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ],
                max_tokens=4000,
                temperature=0.1,  # Low temperature for more accurate OCR
                top_p=0.8,
                timeout=60  # 60 second timeout
            )
            
            elapsed = time.time() - start_time
            logger.info(f"API call completed in {elapsed:.2f} seconds")
        except Exception as api_error:
            logger.error(f"API call failed: {str(api_error)}")
            raise
        
        # Extract response
        extracted_text = completion.choices[0].message.content.strip()
        
        logger.info(f"API Response received: {len(extracted_text)} characters")
        logger.info(f"Tokens used: {completion.usage.total_tokens}")
        
        # Check if text was detected
        if extracted_text == "[NO TEXT DETECTED]" or not extracted_text:
            logger.warning("No text detected in image")
            return {
                "image": os.path.basename(image_path),
                "text": "",
                "detected": False,
                "tokens_used": completion.usage.total_tokens,
                "model": QWEN_MODEL
            }
        
        # Log preview of extracted text
        preview = extracted_text[:200] + "..." if len(extracted_text) > 200 else extracted_text
        logger.info(f"Extracted text preview: {preview}")
        
        return {
            "image": os.path.basename(image_path),
            "text": extracted_text,
            "detected": True,
            "tokens_used": completion.usage.total_tokens,
            "model": QWEN_MODEL,
            "char_count": len(extracted_text)
        }
    
    except FileNotFoundError as e:
        logger.error(f"File error: {str(e)}")
        return {
            "image": os.path.basename(image_path),
            "text": "",
            "detected": False,
            "error": str(e)
        }
    
    except ValueError as e:
        logger.error(f"Configuration error: {str(e)}")
        return {
            "image": os.path.basename(image_path),
            "text": "",
            "detected": False,
            "error": str(e)
        }
    
    except Exception as e:
        logger.error(f"OCR extraction failed: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        
        import traceback
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        
        # Check for common API errors
        error_msg = str(e)
        if "authentication" in error_msg.lower() or "api key" in error_msg.lower():
            error_msg = "Invalid API key. Please check your QWEN_API_KEY."
        elif "rate limit" in error_msg.lower():
            error_msg = "API rate limit exceeded. Please wait and try again."
        elif "quota" in error_msg.lower():
            error_msg = "API quota exceeded. Please check your account."
        elif "timeout" in error_msg.lower():
            error_msg = "API request timed out. Please try again."
        
        return {
            "image": os.path.basename(image_path),
            "text": "",
            "detected": False,
            "error": error_msg
        }

def main():
    """CLI entry point for processing multiple images"""
    logger.info("="*60)
    logger.info("QWEN OCR SCRIPT STARTED")
    logger.info(f"Total arguments: {len(sys.argv)}")
    logger.info("="*60)
    
    if len(sys.argv) < 2:
        error_result = [{
            "error": "No image paths provided. Usage: python qwen_ocr.py <image1> [image2] ...",
            "usage": "Set QWEN_API_KEY environment variable before running"
        }]
        print(json.dumps(error_result, indent=2))
        sys.exit(1)
    
    # Check API key
    if not QWEN_API_KEY:
        logger.error("QWEN_API_KEY not found in environment variables")
        error_result = [{
            "error": "QWEN_API_KEY not set. Please set this environment variable.",
            "help": "Set via: set QWEN_API_KEY=your_key_here (Windows) or export QWEN_API_KEY=your_key_here (Linux/Mac)"
        }]
        print(json.dumps(error_result, indent=2))
        sys.exit(1)
    
    results = []
    for idx, image_path in enumerate(sys.argv[1:], 1):
        logger.info(f"\n{'#'*60}")
        logger.info(f"PROCESSING IMAGE {idx}/{len(sys.argv)-1}")
        logger.info(f"Path: {image_path}")
        logger.info(f"{'#'*60}")
        
        result = extract_text_from_image(image_path)
        results.append(result)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"ALL PROCESSING COMPLETE - {len(results)} images processed")
    logger.info(f"{'='*60}")
    
    # Output JSON to stdout (for Node.js to read)
    output = json.dumps(results, ensure_ascii=False, indent=2)
    print(output)
    
    logger.info("JSON output sent to stdout")

if __name__ == "__main__":
    main()