import cloudinary from '../config/cloudinary.js';
import upload from '../middleware/upload.middleware.js';
import { createAuditLog } from '../utils/auditLogger.js';
import fs from 'fs';

// @desc    Upload media files (images/videos) and return Cloudinary URLs
// @route   POST /api/uploads
// @access  Private (Patient or Doctor)
export const uploadMedia = async (req, res, next) => {
  try {
    // `upload` middleware already stored file on disk; we will upload to Cloudinary
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const filePath = req.file.path;
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'health_app_media'
    });
    // Return URL
    await createAuditLog({ action: 'upload_media', req, target: 'Media Upload', details: { url: result.secure_url } });
    return res.status(201).json({ success: true, data: { url: result.secure_url } });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload symptom image and return Cloudinary secure_url for AI analysis
// @route   POST /api/ai/upload-symptom-image
// @access  Private (Patient)
export const uploadSymptomImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    const filePath = req.file.path;
    // Upload to Cloudinary in dedicated symptom-images folder
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'health_app_symptom_images',
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto'
    });
    // Remove temp local file
    try { fs.unlinkSync(filePath); } catch (_) {}
    await createAuditLog({ action: 'upload_symptom_image', req, target: 'Symptom Image', details: { url: result.secure_url } });
    return res.status(201).json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (error) {
    next(error);
  }
};
