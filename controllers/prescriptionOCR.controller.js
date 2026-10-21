import aiClient from '../utils/aiClient.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import Tesseract from 'tesseract.js';

// @desc    Prescription OCR - Extract medications from uploaded image using AI Vision
// @route   POST /api/ai/prescription-ocr
// @access  Private (Patient)
export const prescriptionOCR = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No prescription image uploaded' });
        }

        const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
        const fileBuffer = fs.readFileSync(filePath);
        
        // 1. Image Quality Validation
        const metadata = await sharp(fileBuffer).metadata();
        if (metadata.width < 400 || metadata.height < 400) {
            throw new Error("QUALITY_LOW_RESOLUTION");
        }

        const stats = await sharp(fileBuffer).stats();
        const brightness = stats.channels[0].mean;
        if (brightness < 30) {
            throw new Error("QUALITY_TOO_DARK");
        }

        // 2. Image Preprocessing (Orientation, Grayscale, Contrast, Blur/Sharpen)
        const processedImageBuffer = await sharp(fileBuffer)
            .resize({ width: 1600, withoutEnlargement: true }) // Resize large images to prevent Vision AI payload errors
            .rotate() // Auto-orient based on EXIF
            .grayscale() // Convert to grayscale
            .normalize() // Enhance global contrast
            // CLAHE acts like adaptive thresholding to bring out text in shadows
            .clahe({ width: 200, height: 200, maxSlope: 3 })
            .blur(0.5) // Remove high frequency noise (Gaussian blur)
            .sharpen({ sigma: 1.5, m1: 1, m2: 20 }) // Sharpen text edges
            .jpeg({ quality: 80 }) // Compress for performance
            .toBuffer();

        const base64Image = processedImageBuffer.toString('base64');
        const mimeType = 'image/jpeg';

        // 3. Stage 1: Tesseract OCR Pass
        let text = '';
        let ocrConfidence = 0;
        try {
            console.log('Running primary OCR (Tesseract)...');
            
            // Tesseract can hang on cloud servers while downloading language data.
            // We use a 4-second timeout to force a fast fallback to Vision AI if it takes too long.
            const tesseractPromise = Tesseract.recognize(processedImageBuffer, 'eng');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Tesseract timeout')), 4000)
            );
            
            const result = await Promise.race([tesseractPromise, timeoutPromise]);
            text = result.data.text;
            ocrConfidence = result.data.confidence;
            console.log(`Tesseract OCR Confidence: ${ocrConfidence}%`);
        } catch (tesseractError) {
            console.error('Tesseract OCR skipped/crashed:', tesseractError.message);
            // If Tesseract times out or fails entirely, ocrConfidence remains 0, triggering the fast Vision AI fallback
        }

        let extracted;
        const SYSTEM_PROMPT = 'You are an advanced medical parsing AI. Return ONLY a valid JSON object strictly matching this structure:\n{\n  "doctor": "Extracted Doctor Name or null",\n  "medicines": [\n    {\n      "name": "Medicine Name",\n      "dosage": "Dosage (e.g., 500mg, 1 tablet)",\n      "frequency": "Frequency (e.g., Twice daily, TDS)",\n      "duration": "Duration (e.g., 5 days)",\n      "uncertain": false\n    }\n  ],\n  "confidence": 95\n}\n\nThe "uncertain" field should be a boolean set to true ONLY if you are not very sure about the extraction (due to messy handwriting, unusual spelling, or poor image quality).';

        // 4. Hybrid Logic: If OCR confidence is high, parse text; else fallback to Vision AI
        let usedVision = false;

        if (ocrConfidence >= 85 && text.trim().length > 10) {
            console.log('High OCR confidence. Parsing text with LLM...');
            const response = await aiClient.chat.completions.create({
                model: 'llama3-8b-8192', // Fast text model
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Parse the following accurate OCR text extracted from a printed prescription:\n\n${text}` }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 1024,
                temperature: 0.1
            });
            extracted = JSON.parse(response.choices[0].message.content);
            extracted.confidence = Math.min(Math.round(ocrConfidence), extracted.confidence || 95);
        }
        
        // If OCR had low confidence, OR if OCR had high confidence but the LLM couldn't find any valid medicines (garbage text), use Vision AI
        if (!extracted || !extracted.medicines || extracted.medicines.length === 0) {
            console.log('OCR text was unparseable or confidence was low. Falling back to Vision AI (Groq Llama 4 Scout)...');
            usedVision = true;

            const response = await aiClient.chat.completions.create({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Groq's new natively multimodal vision model
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT + '\nYou are analyzing the actual prescription image. Pay close attention to messy handwriting. Use your vision capabilities to accurately identify handwritten medicine names.' },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract doctor and medicines from this prescription. Remember to flag uncertain items.' },
                            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                        ]
                    }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 1024,
                temperature: 0.1
            });
            extracted = JSON.parse(response.choices[0].message.content);
        }

        // Clean up uploaded file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Failed to delete temp OCR file:', err.message);
        });

        res.status(200).json({
            success: true,
            data: extracted
        });

    } catch (error) {
        console.error('Prescription OCR Error:', error.message || error);

        // Clean up file on error
        if (req.file) {
            const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
            fs.unlink(filePath, () => {});
        }

        let errorMessage = error.message || 'Failed to process prescription image';
        if (error.message === 'QUALITY_LOW_RESOLUTION') {
            errorMessage = 'Image resolution is too low. Please upload a clearer, higher-quality image of the prescription.';
        } else if (error.message === 'QUALITY_TOO_DARK') {
            errorMessage = 'Image is too dark. Please take a photo in a well-lit environment.';
        }

        res.status(400).json({
            success: false,
            message: errorMessage
        });
    }
};
