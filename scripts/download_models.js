import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelsDir = path.join(__dirname, '..', 'models_ai');

if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir);
}

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

const filesToDownload = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

function downloadFile(filename) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(modelsDir, filename);
        if (fs.existsSync(filePath)) {
            console.log(`${filename} already exists.`);
            return resolve();
        }
        
        const file = fs.createWriteStream(filePath);
        console.log(`Downloading ${filename}...`);
        
        https.get(baseUrl + filename, (response) => {
            if (response.statusCode !== 200) {
                fs.unlink(filePath, () => {});
                return reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`Successfully downloaded ${filename}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

async function downloadAll() {
    try {
        for (const file of filesToDownload) {
            await downloadFile(file);
        }
        console.log('All models downloaded successfully!');
    } catch (err) {
        console.error('Error downloading models:', err);
    }
}

downloadAll();
