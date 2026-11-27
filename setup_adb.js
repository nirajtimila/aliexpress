const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const toolsDir = path.join(__dirname, 'tools');
if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
}

const zipPath = path.join(toolsDir, 'platform-tools.zip');
const adbPath = path.join(toolsDir, 'platform-tools', 'adb.exe');

if (fs.existsSync(adbPath)) {
    console.log('ADB already present at:', adbPath);
    process.exit(0);
}

console.log('Downloading Android platform-tools from Google...');
const file = fs.createWriteStream(zipPath);

https.get('https://dl.google.com/android/repository/platform-tools-latest-windows.zip', (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (redirectRes) => {
            redirectRes.pipe(file);
            file.on('finish', () => {
                file.close(() => extractZip());
            });
        });
    } else {
        res.pipe(file);
        file.on('finish', () => {
            file.close(() => extractZip());
        });
    }
}).on('error', (err) => {
    console.error('Download error:', err.message);
});

function extractZip() {
    console.log('Extracting platform-tools...');
    try {
        execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${toolsDir}' -Force"`);
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        console.log('ADB successfully extracted to:', adbPath);
    } catch (e) {
        console.error('Extraction error:', e.message);
    }
}
