import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

// Mocking environment for face-api
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelsPath = path.join(__dirname, '..', 'models_ai');

let modelsLoaded = false;

/**
 * Initializes the face-api models
 */
export async function initFaceRecognition() {
    if (modelsLoaded) return;
    try {
        console.log('Loading face recognition models...');
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath),
            faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
            faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath),
        ]);
        modelsLoaded = true;
        console.log('Face recognition models loaded successfully.');
    } catch (error) {
        console.error('Error loading face-api models:', error);
    }
}

/**
 * Extracts a 128-dimensional face embedding from an image buffer
 * @param {Buffer} imageBuffer
 * @returns {Array<number>|null} The embedding array or null if no face found
 */
export async function getFaceEmbedding(imageBuffer) {
    if (!modelsLoaded) {
        await initFaceRecognition();
    }
    try {
        const img = await loadImage(imageBuffer);
        
        // Resize large images to significantly speed up processing time on the backend CPU
        const MAX_WIDTH = 400;
        let scale = 1;
        if (img.width > MAX_WIDTH) {
            scale = MAX_WIDTH / img.width;
        }

        const canvas = new Canvas(img.width * scale, img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const detection = await faceapi.detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            return null; // No face detected
        }
        
        // Convert Float32Array to standard array
        return Array.from(detection.descriptor);
    } catch (error) {
        console.error('Error processing image for face recognition:', error);
        return null;
    }
}

/**
 * Calculates cosine similarity between two vectors
 * @param {Array<number>} vecA 
 * @param {Array<number>} vecB 
 * @returns {number} similarity score (between -1 and 1, higher is better)
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
