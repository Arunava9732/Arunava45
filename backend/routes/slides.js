/**
 * Home Page Slider Routes
 * Manage videos/images for the hero slider section
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticate, isAdmin } = require('../middleware/auth');
const { Database } = require('../utils/database');
const { validators, validateRequest } = require('../middleware/security');
const { body, param } = require('express-validator');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const slidesDb = new Database('slides');

// AI-OPTIMIZED: Disable caching for all slider data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Upload directory for slides
const SLIDES_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'slides');

// Helper to delete uploaded file
function deleteUploadedFile(filePath) {
  try {
    if (!filePath) return;
    
    // Extract filename from URL path
    let filename = filePath;
    if (filePath.includes('/uploads/slides/')) {
      filename = filePath.split('/uploads/slides/').pop();
    } else if (filePath.includes('/api/uploads/slides/')) {
      filename = filePath.split('/api/uploads/slides/').pop();
    }
    
    const fullPath = path.join(SLIDES_UPLOAD_DIR, filename);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('Deleted slide file:', fullPath);
    }
  } catch (error) {
    console.error('Error deleting slide file:', error);
  }
}

// GET /api/slides - Get all slides (public)
router.get('/', (req, res) => {
  try {
    const slides = slidesDb.findAll();
    // Return only active slides for public, sorted by position
    const activeSlides = slides
      .filter(slide => slide.active !== false)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // AI-OPTIMIZED: Use shorter cache or no-cache for admin real-time visibility
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, slides: activeSlides });
  } catch (error) {
    console.error('Error fetching slides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch slides' });
  }
});

// GET /api/slides/all - Get all slides including inactive (admin only)
router.get('/all', authenticate, isAdmin, (req, res) => {
  try {
    const slides = slidesDb.findAll();
    // Sort by position
    slides.sort((a, b) => (a.position || 0) - (b.position || 0));
    res.json({ success: true, slides });
  } catch (error) {
    console.error('Error fetching all slides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch slides' });
  }
});

// POST /api/slides - Add new slide (admin only)
router.post('/', authenticate, isAdmin, (req, res) => {
  try {
    const { type, src, title, active, position } = req.body;

    if (!type || !src) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type and source URL are required' 
      });
    }

    if (!['video', 'image'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type must be "video" or "image"' 
      });
    }

    const slides = slidesDb.findAll();
    
    // Generate new ID
    const newId = `slide-${Date.now()}`;
    
    // Calculate position if not provided
    const newPosition = position || slides.length + 1;

    const newSlide = {
      id: newId,
      type,
      src,
      title: title || '',
      active: active !== false,
      position: newPosition,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    slides.push(newSlide);
    slidesDb._write(slides);

    console.log(`[AI-Enhanced] Slide created: ${newId}, Type: ${type}, Position: ${newPosition}`);

    res.status(201).json({ success: true, slide: newSlide });
  } catch (error) {
    console.error('Error creating slide:', error);
    res.status(500).json({ success: false, error: 'Failed to create slide' });
  }
});

// PUT /api/slides/:id - Update slide (admin only)
router.put('/:id', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { type, src, title, active, position } = req.body;

    const slides = slidesDb.findAll();
    const slideIndex = slides.findIndex(s => s.id === id);

    if (slideIndex === -1) {
      return res.status(404).json({ success: false, error: 'Slide not found' });
    }

    // Update slide fields
    if (type && ['video', 'image'].includes(type)) slides[slideIndex].type = type;
    if (src) slides[slideIndex].src = src;
    if (title !== undefined) slides[slideIndex].title = title;
    if (active !== undefined) slides[slideIndex].active = active;
    if (position !== undefined) slides[slideIndex].position = position;
    slides[slideIndex].updatedAt = new Date().toISOString();

    slidesDb._write(slides);

    console.log(`[AI-Enhanced] Slide updated: ${id}, Type: ${type || 'unchanged'}`);

    res.json({ success: true, slide: slides[slideIndex] });
  } catch (error) {
    console.error('Error updating slide:', error);
    res.status(500).json({ success: false, error: 'Failed to update slide' });
  }
});

// PUT /api/slides/reorder - Reorder slides (admin only)
router.put('/reorder/positions', authenticate, isAdmin, (req, res) => {
  try {
    const { order } = req.body; // Array of { id, position }

    if (!Array.isArray(order)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order must be an array of { id, position }' 
      });
    }

    const slides = slidesDb.findAll();

    // Update positions
    order.forEach(({ id, position }) => {
      const slide = slides.find(s => s.id === id);
      if (slide) {
        slide.position = position;
        slide.updatedAt = new Date().toISOString();
      }
    });

    slidesDb._write(slides);

    res.json({ success: true, message: 'Slides reordered successfully' });
  } catch (error) {
    console.error('Error reordering slides:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder slides' });
  }
});

// DELETE /api/slides/:id - Delete slide (admin only)
router.delete('/:id', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const slides = slidesDb.findAll();
    const slideIndex = slides.findIndex(s => s.id === id);

    if (slideIndex === -1) {
      return res.status(404).json({ success: false, error: 'Slide not found' });
    }

    const deletedSlide = slides.splice(slideIndex, 1)[0];
    
    // Delete the uploaded file (video or image)
    if (deletedSlide.src) {
      deleteUploadedFile(deletedSlide.src);
    }
    
    slidesDb._write(slides);

    res.json({ success: true, message: 'Slide deleted', slide: deletedSlide });
  } catch (error) {
    console.error('Error deleting slide:', error);
    res.status(500).json({ success: false, error: 'Failed to delete slide' });
  }
});

module.exports = router;
