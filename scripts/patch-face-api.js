import fs from 'fs';
import path from 'path';

const fileToPatch = path.join(process.cwd(), 'node_modules', '@vladmandic', 'face-api', 'dist', 'face-api.node.js');

try {
    if (fs.existsSync(fileToPatch)) {
        let content = fs.readFileSync(fileToPatch, 'utf-8');
        if (content.includes('require("@tensorflow/tfjs-node")')) {
            content = content.replace(/require\("@tensorflow\/tfjs-node"\)/g, 'require("@tensorflow/tfjs")');
            fs.writeFileSync(fileToPatch, content, 'utf-8');
            console.log('[Patch] Successfully patched @vladmandic/face-api to use pure @tensorflow/tfjs instead of tfjs-node');
        } else {
            console.log('[Patch] @vladmandic/face-api is already patched or does not contain tfjs-node requirement');
        }
    } else {
        console.warn('[Patch Warning] face-api.node.js not found in node_modules');
    }
} catch (error) {
    console.error('[Patch Error] Failed to patch face-api:', error.message);
}
