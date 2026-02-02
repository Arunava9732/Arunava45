/**
 * File Upload Routes with Security
 * Handles file uploads for products, slides, and other media
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticate, isAdmin } = require('../middleware/auth');
const { uploadLimiter, validators } = require('../middleware/security');
const multer = require('multer');
const sharp = require('sharp');

// Upload directories
const UPLOAD_DIRS = {
  products: path.join(__dirname, '..', 'uploads', 'products'),
  slides: path.join(__dirname, '..', 'uploads', 'slides'),
  users: path.join(__dirname, '..', 'uploads', 'users'),
  misc: path.join(__dirname, '..', 'uploads', 'misc'),
  contact: path.join(__dirname, '..', 'uploads', 'contact')
};

// Ensure upload directories exist
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    // Ensure directory is accessible by Nginx
    try {
      fs.chmodSync(dir, 0o755);
    } catch (e) {
      console.warn(`Warning: Could not set permissions on directory ${dir}:`, e.message);
    }
  }
});

// Allowed file types - security whitelist
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for images
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for videos
const MAX_FILE_SIZE = MAX_VIDEO_SIZE;

// Helper to optimize and save image
async function optimizeAndSaveImage(inputPath, outputDir, filename, options = {}) {
  const { width = 1200, quality = 80 } = options;
  
  // Get original extension
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(filename, path.extname(filename));
  const finalFilename = `${baseName}${ext}`;
  const outputPath = path.join(outputDir, finalFilename);

  // If input and output are the same, we need to use a temporary file for sharp
  const isSameFile = inputPath === outputPath;
  const processingPath = isSameFile ? `${outputPath}.tmp` : outputPath;

  try {
    let pipeline = sharp(inputPath);
    
    if (width) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true });
    }

    // Keep original format but allow quality adjustment for JPEG/WebP/PNG if they were original
    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ quality });
    }

    await pipeline.toFile(processingPath);

    if (isSameFile) {
      await fs.promises.rename(processingPath, outputPath);
    }

    // Ensure file is readable by Nginx (0644 = rw-r--r--)
    try {
      await fs.promises.chmod(outputPath, 0o644);
    } catch (err) {
      console.warn('Warning: Could not set file permissions on optimized image:', err.message);
    }

    // If it was a temporary file (starts with temp_), delete it
    const isTempFile = path.basename(inputPath).startsWith('temp_');
    
    if (isTempFile && inputPath !== outputPath) {
      try { await fs.promises.unlink(inputPath); } catch (e) {}
    }

    return finalFilename;
  } catch (error) {
    console.error('Image optimization failed:', error);
    // Clean up temp file if it exists
    if (isSameFile && fs.existsSync(processingPath)) {
      try { fs.unlinkSync(processingPath); } catch (e) {}
    }
    throw error;
  }
}

// Multer helper for streaming multipart uploads
function multerFor(type, fieldName, maxCount = 1, allowedTypesOverride, maxSize) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = UPLOAD_DIRS[type];
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const prefix = (req.body && req.body.productId) ? `${req.body.productId}_` : '';
      const filename = generateFilename(file.originalname || 'file', prefix);
      cb(null, filename);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: maxSize || MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      const allowed = allowedTypesOverride || (file.mimetype && file.mimetype.startsWith('video') ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES);
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(null, false);
    }
  });

  return maxCount === 1 ? upload.single(fieldName) : upload.array(fieldName, maxCount);
}

// Helper function to generate unique filename
function generateFilename(originalName, prefix = '') {
  // Sanitize original name
  const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const ext = path.extname(safeName).toLowerCase();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${random}${ext}`;
}

// Validate file type from base64
function validateFileType(base64Data, allowedTypes) {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,/);
  if (matches && matches.length > 1) {
    return allowedTypes.includes(matches[1]);
  }
  return false;
}

// Get extension from base64
function getExtensionFromBase64(base64Data) {
  const matches = base64Data.match(/^data:image\/([A-Za-z-+]+);base64,/);
  if (matches && matches.length > 1) {
    const type = matches[1].toLowerCase();
    if (type === 'jpeg') return '.jpg';
    return `.${type}`;
  }
  return '.jpg'; // Default
}

// Helper function to save base64 file
async function saveBase64File(base64Data, directory, filename) {
  // Remove data URL prefix if present
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  
  let buffer;
  if (matches && matches.length === 3) {
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(base64Data, 'base64');
  }
  
  const filepath = path.join(directory, filename);
  await fs.promises.writeFile(filepath, buffer);
  
  // Ensure file is readable by Nginx (0644 = rw-r--r--)
  try {
    await fs.promises.chmod(filepath, 0o644);
  } catch (err) {
    console.warn('Warning: Could not set file permissions:', err.message);
  }
  
  return filepath;
}

// Upload single product image (base64) - with rate limiting
router.post('/product-image', uploadLimiter, authenticate, isAdmin, multerFor('products', 'image', 1), async (req, res) => {
  try {
    // If multipart upload used, multer will populate req.file
    if (req.file) {
      // Ensure permissions for Nginx
      try { await fs.promises.chmod(req.file.path, 0o644); } catch (e) {}
      const filename = path.basename(req.file.path);
      return res.json({ success: true, url: `/uploads/products/${filename}`, filename });
    }

    const { image, productId, type = 'main' } = req.body;
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    
    // Validate file type
    if (!validateFileType(image, ALLOWED_IMAGE_TYPES)) {
      return res.status(400).json({ success: false, error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' });
    }
    
    // Check file size
    const base64Data = image.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size: 10MB' });
    }
    
    const prefix = type === 'main' ? 'main_' : 'thumb_';
    const ext = getExtensionFromBase64(image);
    const finalFilename = generateFilename(`image${ext}`, `${productId || 'prod'}_${prefix}`);
    
    await saveBase64File(image, UPLOAD_DIRS.products, finalFilename);
    
    res.json({ 
      success: true, 
      url: `/uploads/products/${finalFilename}`,
      filename: finalFilename
    });
  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});

// Upload multiple product thumbnails (base64) - with rate limiting
router.post('/product-thumbnails', uploadLimiter, authenticate, isAdmin, multerFor('products', 'images', 10), async (req, res) => {
  try {
    // If multipart used
    if (req.files && req.files.length > 0) {
      // Ensure permissions for all files
      await Promise.all(req.files.map(f => fs.promises.chmod(f.path, 0o644).catch(() => {})));
      const urls = req.files.map(f => ({ filename: path.basename(f.path), url: `/uploads/products/${path.basename(f.path)}` }));
      return res.json({ success: true, urls: urls.map(u => u.url) });
    }

    const { images, productId } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: 'No images provided' });
    }
    
    // Limit number of thumbnails
    if (images.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 thumbnails allowed' });
    }
    
    const urls = [];
    
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      
      // Validate each image
      if (!validateFileType(image, ALLOWED_IMAGE_TYPES)) {
        return res.status(400).json({ success: false, error: `Invalid image type for thumbnail ${index + 1}` });
      }
      
      const ext = getExtensionFromBase64(image);
      const filename = generateFilename(`thumb${ext}`, `${productId || 'prod'}_thumb${index}_`);
      await saveBase64File(image, UPLOAD_DIRS.products, filename);
      urls.push(`/uploads/products/${filename}`);
    }
    
    res.json({ 
      success: true, 
      urls: urls
    });
  } catch (error) {
    console.error('Upload thumbnails error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload thumbnails' });
  }
});

// Upload slide media (base64) - with rate limiting
router.post('/slide-media', uploadLimiter, authenticate, isAdmin, multerFor('slides', 'media', 1), async (req, res) => {
  try {
    // If multipart used
    if (req.file) {
      // Ensure permissions
      try { await fs.promises.chmod(req.file.path, 0o644); } catch (e) {}
      const filename = path.basename(req.file.path);
      return res.json({ success: true, url: `/uploads/slides/${filename}`, filename });
    }

    const { media, type = 'image', slideId } = req.body;
    
    if (!media) {
      return res.status(400).json({ success: false, error: 'No media provided' });
    }
    
    // Validate media type using helper function
    const allowedTypes = type === 'video' ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
    if (!validateFileType(media, allowedTypes)) {
      return res.status(400).json({ success: false, error: `Invalid ${type} type` });
    }
    
    // Check file size
    const base64Data = media.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const fileSize = Buffer.from(base64Data, 'base64').length;
    const maxSize = type === 'video' ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (fileSize > maxSize) {
      return res.status(400).json({ success: false, error: `File too large. Maximum size: 100MB` });
    }
    
    let ext = type === 'video' ? '.mp4' : '.jpg';
    if (type === 'image') {
      ext = getExtensionFromBase64(media);
    }
    const filename = generateFilename(`slide${ext}`, `${slideId || 'slide'}_`);
    
    await saveBase64File(media, UPLOAD_DIRS.slides, filename);
    
    const fileUrl = `/uploads/slides/${filename}`;
    
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: filename
    });
  } catch (error) {
    console.error('Upload slide media error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload media' });
  }
});

// Upload user avatar (base64) - with rate limiting
router.post('/user-avatar', uploadLimiter, authenticate, multerFor('users', 'avatar', 1, ALLOWED_IMAGE_TYPES, 5 * 1024 * 1024), async (req, res) => {
  try {
    // If multipart used
    if (req.file) {
      // Ensure permissions
      try { await fs.promises.chmod(req.file.path, 0o644); } catch (e) {}
      const filename = path.basename(req.file.path);
      return res.json({ success: true, url: `/uploads/users/${filename}`, filename });
    }

    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    
    // Validate it's an image
    if (!validateFileType(image, ALLOWED_IMAGE_TYPES)) {
      return res.status(400).json({ success: false, error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' });
    }
    
    // Check file size (5MB max for avatars)
    const base64Data = image.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const fileSize = Buffer.from(base64Data, 'base64').length;
    if (fileSize > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Avatar too large. Maximum size: 5MB' });
    }
    
    const ext = getExtensionFromBase64(image);
    const filename = generateFilename(`avatar${ext}`, `user_${req.user.id}_`);
    await saveBase64File(image, UPLOAD_DIRS.users, filename);
    
    const fileUrl = `/uploads/users/${filename}`;
    
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: filename
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload avatar' });
  }
});

// Upload misc file (base64) - with rate limiting
router.post('/misc', uploadLimiter, authenticate, isAdmin, multerFor('misc', 'file', 1), async (req, res) => {
  try {
    // If multipart used
    if (req.file) {
      // Ensure permissions
      try { await fs.promises.chmod(req.file.path, 0o644); } catch (e) {}
      const filename = path.basename(req.file.path);
      return res.json({ success: true, url: `/uploads/misc/${filename}`, filename });
    }

    const { file, filename: originalName } = req.body;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    
    // Validate file type (only allow images and videos for misc)
    if (!validateFileType(file, [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES])) {
      return res.status(400).json({ success: false, error: 'Invalid file type' });
    }
    
    // Check file size
    const base64Data = file.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const fileSize = Buffer.from(base64Data, 'base64').length;
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size: 100MB' });
    }
    
    const filename = generateFilename(originalName || 'file', 'misc_');
    await saveBase64File(file, UPLOAD_DIRS.misc, filename);
    
    const fileUrl = `/uploads/misc/${filename}`;
    
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: filename
    });
  } catch (error) {
    console.error('Upload misc file error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
});

// Upload invoice logo (for tax invoices)
router.post('/invoice-logo', uploadLimiter, authenticate, isAdmin, multerFor('misc', 'logo', 1, ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'], 2 * 1024 * 1024), async (req, res) => {
  try {
    // If multipart used
    if (req.file) {
      // Ensure permissions
      try { await fs.promises.chmod(req.file.path, 0o644); } catch (e) {}
      const filename = path.basename(req.file.path);
      const fileUrl = `/uploads/misc/${filename}`;
      console.log('[Upload] Invoice logo uploaded:', fileUrl);
      return res.json({ success: true, url: fileUrl, filename });
    }

    const { logo } = req.body;
    
    if (!logo) {
      return res.status(400).json({ success: false, error: 'No logo file provided' });
    }
    
    // Validate file type (only images for invoice logo)
    if (!validateFileType(logo, ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])) {
      return res.status(400).json({ success: false, error: 'Invalid file type. Use PNG, JPG, SVG or WebP' });
    }
    
    // Check file size (max 2MB for logo)
    const base64Data = logo.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const fileSize = Buffer.from(base64Data, 'base64').length;
    if (fileSize > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Logo too large. Maximum size: 2MB' });
    }
    
    const filename = generateFilename('invoice-logo.png', 'inv_logo_');
    await saveBase64File(logo, UPLOAD_DIRS.misc, filename);
    
    const fileUrl = `/uploads/misc/${filename}`;
    console.log('[Upload] Invoice logo saved:', fileUrl);
    
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: filename
    });
  } catch (error) {
    console.error('Upload invoice logo error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload invoice logo' });
  }
});

// Serve uploaded files with proper MIME types and video streaming support
router.get('/products/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // Sanitize
    const filepath = path.join(UPLOAD_DIRS.products, filename);
    await fs.promises.access(filepath, fs.constants.R_OK);
    
    // Set proper content type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif',
      '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    return res.sendFile(filepath);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

// Video streaming helper for slides (supports range requests)
async function streamVideo(req, res, filepath) {
  const stat = await fs.promises.stat(filepath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  const ext = path.extname(filepath).toLowerCase();
  const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';
  
  if (range) {
    // Parse range header
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });
    
    const stream = fs.createReadStream(filepath, { start, end });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    
    fs.createReadStream(filepath).pipe(res);
  }
}

router.get('/slides/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // Sanitize
    const filepath = path.join(UPLOAD_DIRS.slides, filename);
    await fs.promises.access(filepath, fs.constants.R_OK);
    
    const ext = path.extname(filename).toLowerCase();
    
    // Handle video streaming with range requests
    if (ext === '.mp4' || ext === '.webm') {
      return await streamVideo(req, res, filepath);
    }
    
    // Set proper content type for images
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    return res.sendFile(filepath);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

router.get('/users/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // Sanitize
    const filepath = path.join(UPLOAD_DIRS.users, filename);
    await fs.promises.access(filepath, fs.constants.R_OK);
    
    // Set proper content type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    return res.sendFile(filepath);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

router.get('/misc/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // Sanitize
    const filepath = path.join(UPLOAD_DIRS.misc, filename);
    await fs.promises.access(filepath, fs.constants.R_OK);
    
    const ext = path.extname(filename).toLowerCase();
    
    // Handle video streaming with range requests
    if (ext === '.mp4' || ext === '.webm') {
      return await streamVideo(req, res, filepath);
    }
    
    // Set proper content type for images
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    return res.sendFile(filepath);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

// Delete uploaded file (admin only)
router.delete('/:type/:filename', authenticate, isAdmin, async (req, res) => {
  try {
    const { type, filename } = req.params;

    if (!UPLOAD_DIRS[type]) {
      return res.status(400).json({ success: false, error: 'Invalid upload type' });
    }

    const filepath = path.join(UPLOAD_DIRS[type], filename);

    try {
      await fs.promises.access(filepath, fs.constants.F_OK);
      await fs.promises.unlink(filepath);
      return res.json({ success: true, message: 'File deleted successfully' });
    } catch (err) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
});

// List uploaded files (admin only)
router.get('/list/:type', authenticate, isAdmin, async (req, res) => {
  try {
    const { type } = req.params;

    if (!UPLOAD_DIRS[type]) {
      return res.status(400).json({ success: false, error: 'Invalid upload type' });
    }

    const dir = UPLOAD_DIRS[type];
    const filenames = await fs.promises.readdir(dir);
    const fileInfos = await Promise.all(filenames.map(async (filename) => {
      const filepath = path.join(dir, filename);
      try {
        const stats = await fs.promises.stat(filepath);
        return {
          filename,
          url: `/api/uploads/${type}/${filename}`,
          size: stats.size,
          createdAt: stats.birthtime
        };
      } catch (e) {
        return null;
      }
    }));

    const files = fileInfos.filter(Boolean);
    res.json({ success: true, files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

// Get storage stats (admin only)
router.get('/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const stats = {};
    let totalSize = 0;
    let totalFiles = 0;

    for (const [type, dir] of Object.entries(UPLOAD_DIRS)) {
      try {
        const files = await fs.promises.readdir(dir);
        let typeSize = 0;

        await Promise.all(files.map(async (filename) => {
          try {
            const filepath = path.join(dir, filename);
            const fileStats = await fs.promises.stat(filepath);
            typeSize += fileStats.size;
          } catch (e) {
            // ignore missing files
          }
        }));

        stats[type] = {
          count: files.length,
          size: typeSize,
          sizeFormatted: formatBytes(typeSize)
        };

        totalSize += typeSize;
        totalFiles += files.length;
      } catch (e) {
        stats[type] = { count: 0, size: 0, sizeFormatted: formatBytes(0) };
      }
    }

    res.json({
      success: true,
      stats,
      total: {
        files: totalFiles,
        size: totalSize,
        sizeFormatted: formatBytes(totalSize)
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// Upload contact attachments (public - up to 3 images, max 5MB each)
router.post('/contact-attachments', uploadLimiter, multerFor('contact', 'images', 3, ALLOWED_IMAGE_TYPES, 5 * 1024 * 1024), async (req, res) => {
  try {
    // If multipart upload used
    if (req.files && req.files.length > 0) {
      const urls = req.files.map(f => ({
        filename: path.basename(f.path),
        url: `/uploads/contact/${path.basename(f.path)}`
      }));
      return res.json({ success: true, attachments: urls });
    }

    // Handle base64 uploads
    const { images } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: 'No images provided' });
    }

    if (images.length > 3) {
      return res.status(400).json({ success: false, error: 'Maximum 3 images allowed' });
    }

    const attachments = [];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const image of images) {
      // Validate file type
      if (!validateFileType(image, ALLOWED_IMAGE_TYPES)) {
        return res.status(400).json({ success: false, error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' });
      }

      // Check file size
      const base64Data = image.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
      const fileSize = Buffer.from(base64Data, 'base64').length;
      if (fileSize > maxSize) {
        return res.status(400).json({ success: false, error: 'Each image must be less than 5MB' });
      }

      const ext = getExtensionFromBase64(image);
      const filename = generateFilename(`attachment${ext}`, 'contact_');
      await saveBase64File(image, UPLOAD_DIRS.contact, filename);
      
      attachments.push({
        filename,
        url: `/uploads/contact/${filename}`
      });
    }

    res.json({ success: true, attachments });
  } catch (error) {
    console.error('Upload contact attachments error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload attachments' });
  }
});

// Serve contact attachments with proper MIME types
router.get('/contact/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // Sanitize
    const filepath = path.join(UPLOAD_DIRS.contact, filename);
    
    await fs.promises.access(filepath, fs.constants.R_OK);
    
    // Set proper content type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    res.sendFile(filepath);
  } catch (error) {
    console.error('Serve contact file error:', error);
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
