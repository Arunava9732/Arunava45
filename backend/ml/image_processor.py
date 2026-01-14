#!/usr/bin/env python3
"""
Image Processing Engine for BLACKONN
Handles image optimization, thumbnail generation, and watermarking
Uses PIL/Pillow for image manipulation
"""

import json
import sys
import base64
import io
import os
from datetime import datetime

# Try to import PIL, provide fallback if not available
try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def check_dependencies():
    """Check if required dependencies are available"""
    return {
        "pillow": PIL_AVAILABLE,
        "status": "ready" if PIL_AVAILABLE else "pillow not installed"
    }


def optimize_image(data):
    """
    Optimize image for web delivery
    - Resize to max dimensions
    - Compress quality
    - Convert format if needed
    """
    if not PIL_AVAILABLE:
        return {"error": "Pillow not installed. Run: pip install Pillow"}
    
    try:
        image_data = data.get('image')  # base64 encoded
        max_width = data.get('maxWidth', 1200)
        max_height = data.get('maxHeight', 1200)
        quality = data.get('quality', 85)
        output_format = data.get('format', 'JPEG').upper()
        
        if not image_data:
            return {"error": "No image data provided"}
        
        # Decode base64 image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert RGBA to RGB for JPEG
        if img.mode == 'RGBA' and output_format == 'JPEG':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        elif img.mode != 'RGB' and output_format == 'JPEG':
            img = img.convert('RGB')
        
        # Calculate new size maintaining aspect ratio
        original_size = img.size
        ratio = min(max_width / img.width, max_height / img.height)
        
        if ratio < 1:
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        
        # Save optimized image
        output = io.BytesIO()
        
        if output_format == 'WEBP':
            img.save(output, format='WEBP', quality=quality, method=6)
        elif output_format == 'PNG':
            img.save(output, format='PNG', optimize=True)
        else:
            img.save(output, format='JPEG', quality=quality, optimize=True)
        
        output.seek(0)
        optimized_base64 = base64.b64encode(output.read()).decode('utf-8')
        
        # Calculate compression stats
        original_bytes = len(image_bytes)
        optimized_bytes = len(output.getvalue())
        savings = ((original_bytes - optimized_bytes) / original_bytes * 100) if original_bytes > 0 else 0
        
        return {
            "success": True,
            "image": f"data:image/{output_format.lower()};base64,{optimized_base64}",
            "stats": {
                "originalSize": original_bytes,
                "optimizedSize": optimized_bytes,
                "savings": round(savings, 2),
                "originalDimensions": list(original_size),
                "newDimensions": list(img.size),
                "format": output_format
            }
        }
        
    except Exception as e:
        return {"error": str(e)}


def generate_thumbnail(data):
    """
    Generate thumbnail from image
    """
    if not PIL_AVAILABLE:
        return {"error": "Pillow not installed"}
    
    try:
        image_data = data.get('image')
        width = data.get('width', 300)
        height = data.get('height', 300)
        mode = data.get('mode', 'cover')  # cover, contain, stretch
        
        if not image_data:
            return {"error": "No image data provided"}
        
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))
        
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        if mode == 'cover':
            # Crop to fill
            img_ratio = img.width / img.height
            target_ratio = width / height
            
            if img_ratio > target_ratio:
                # Image is wider
                new_width = int(img.height * target_ratio)
                left = (img.width - new_width) // 2
                img = img.crop((left, 0, left + new_width, img.height))
            else:
                # Image is taller
                new_height = int(img.width / target_ratio)
                top = (img.height - new_height) // 2
                img = img.crop((0, top, img.width, top + new_height))
            
            img = img.resize((width, height), Image.LANCZOS)
            
        elif mode == 'contain':
            img.thumbnail((width, height), Image.LANCZOS)
            
        else:  # stretch
            img = img.resize((width, height), Image.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=80, optimize=True)
        output.seek(0)
        
        thumbnail_base64 = base64.b64encode(output.read()).decode('utf-8')
        
        return {
            "success": True,
            "thumbnail": f"data:image/jpeg;base64,{thumbnail_base64}",
            "dimensions": [img.width, img.height]
        }
        
    except Exception as e:
        return {"error": str(e)}


def add_watermark(data):
    """
    Add text or image watermark
    """
    if not PIL_AVAILABLE:
        return {"error": "Pillow not installed"}
    
    try:
        image_data = data.get('image')
        watermark_text = data.get('text', 'BLACKONN')
        opacity = data.get('opacity', 0.3)
        position = data.get('position', 'bottom-right')
        
        if not image_data:
            return {"error": "No image data provided"}
        
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        
        # Create watermark layer
        watermark = Image.new('RGBA', img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(watermark)
        
        # Calculate font size based on image size
        font_size = max(20, min(img.width, img.height) // 15)
        
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        # Get text bounding box
        bbox = draw.textbbox((0, 0), watermark_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Calculate position
        padding = 20
        if position == 'bottom-right':
            x = img.width - text_width - padding
            y = img.height - text_height - padding
        elif position == 'bottom-left':
            x = padding
            y = img.height - text_height - padding
        elif position == 'top-right':
            x = img.width - text_width - padding
            y = padding
        elif position == 'top-left':
            x = padding
            y = padding
        else:  # center
            x = (img.width - text_width) // 2
            y = (img.height - text_height) // 2
        
        # Draw watermark
        alpha = int(255 * opacity)
        draw.text((x, y), watermark_text, font=font, fill=(255, 255, 255, alpha))
        
        # Composite
        result = Image.alpha_composite(img, watermark)
        result = result.convert('RGB')
        
        output = io.BytesIO()
        result.save(output, format='JPEG', quality=90)
        output.seek(0)
        
        watermarked_base64 = base64.b64encode(output.read()).decode('utf-8')
        
        return {
            "success": True,
            "image": f"data:image/jpeg;base64,{watermarked_base64}",
            "watermark": {
                "text": watermark_text,
                "position": position,
                "opacity": opacity
            }
        }
        
    except Exception as e:
        return {"error": str(e)}


def analyze_image(data):
    """
    Analyze image properties and suggest optimizations
    """
    if not PIL_AVAILABLE:
        return {"error": "Pillow not installed"}
    
    try:
        image_data = data.get('image')
        
        if not image_data:
            return {"error": "No image data provided"}
        
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))
        
        # Get basic info
        info = {
            "format": img.format or "Unknown",
            "mode": img.mode,
            "width": img.width,
            "height": img.height,
            "aspectRatio": round(img.width / img.height, 2) if img.height > 0 else 0,
            "sizeBytes": len(image_bytes),
            "sizeKB": round(len(image_bytes) / 1024, 2),
            "megapixels": round((img.width * img.height) / 1000000, 2)
        }
        
        # Generate recommendations
        recommendations = []
        
        if len(image_bytes) > 500000:
            recommendations.append({
                "type": "compression",
                "priority": "high",
                "message": "Image is over 500KB. Consider compressing for faster loading."
            })
        
        if img.width > 2000 or img.height > 2000:
            recommendations.append({
                "type": "resize",
                "priority": "medium",
                "message": "Image dimensions are large. Consider resizing to 1200px max."
            })
        
        if img.format == 'PNG' and img.mode != 'RGBA':
            recommendations.append({
                "type": "format",
                "priority": "medium",
                "message": "PNG without transparency. Consider converting to JPEG for smaller size."
            })
        
        if img.format not in ['WEBP']:
            recommendations.append({
                "type": "format",
                "priority": "low",
                "message": "Consider WebP format for better compression with quality."
            })
        
        # Calculate color statistics
        if img.mode == 'RGB' or img.mode == 'RGBA':
            try:
                # Sample colors (resize for speed)
                small = img.copy()
                small.thumbnail((100, 100))
                colors = small.getcolors(maxcolors=10000)
                if colors:
                    dominant_colors = sorted(colors, key=lambda x: x[0], reverse=True)[:5]
                    info["dominantColors"] = [
                        {"rgb": list(c[1][:3]) if len(c[1]) >= 3 else list(c[1]), "count": c[0]}
                        for c in dominant_colors
                    ]
            except:
                pass
        
        return {
            "success": True,
            "analysis": info,
            "recommendations": recommendations,
            "isOptimized": len([r for r in recommendations if r['priority'] == 'high']) == 0
        }
        
    except Exception as e:
        return {"error": str(e)}


def batch_process(data):
    """
    Process multiple images with same settings
    """
    if not PIL_AVAILABLE:
        return {"error": "Pillow not installed"}
    
    images = data.get('images', [])
    operation = data.get('operation', 'optimize')
    settings = data.get('settings', {})
    
    results = []
    
    for i, img_data in enumerate(images[:10]):  # Limit to 10 images
        try:
            if operation == 'optimize':
                result = optimize_image({**settings, 'image': img_data})
            elif operation == 'thumbnail':
                result = generate_thumbnail({**settings, 'image': img_data})
            elif operation == 'analyze':
                result = analyze_image({'image': img_data})
            else:
                result = {"error": "Unknown operation"}
            
            results.append({
                "index": i,
                "success": result.get('success', False),
                "data": result
            })
        except Exception as e:
            results.append({
                "index": i,
                "success": False,
                "error": str(e)
            })
    
    return {
        "processed": len(results),
        "successful": len([r for r in results if r['success']]),
        "results": results
    }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if not isinstance(input_data, dict):
                input_data = {"data": input_data}
            
            if task == "check":
                print(json.dumps(check_dependencies()))
            elif task == "optimize":
                print(json.dumps(optimize_image(input_data)))
            elif task == "thumbnail":
                print(json.dumps(generate_thumbnail(input_data)))
            elif task == "watermark":
                print(json.dumps(add_watermark(input_data)))
            elif task == "analyze":
                print(json.dumps(analyze_image(input_data)))
            elif task == "batch":
                print(json.dumps(batch_process(input_data)))
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Image Processor v1.0", "pillow": PIL_AVAILABLE}))
