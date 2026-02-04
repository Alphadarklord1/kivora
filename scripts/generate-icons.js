const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 64, 128, 256, 512, 1024];
const iconDir = path.join(__dirname, '../public/icons');

// Create a simple icon as PNG (blue book icon)
async function generateIcon() {
  // Create a simple 1024x1024 icon
  const size = 1024;
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6"/>
          <stop offset="100%" style="stop-color:#1d4ed8"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="200" fill="url(#bg)"/>
      <g transform="translate(${size * 0.15}, ${size * 0.15}) scale(0.7)">
        <!-- Book icon -->
        <path d="M512 160c-100 0-180 20-256 60v560c76-40 156-60 256-60s180 20 256 60V220c-76-40-156-60-256-60z"
              fill="white" opacity="0.95"/>
        <path d="M512 160c100 0 180 20 256 60v560c-76-40-156-60-256-60"
              fill="white" opacity="0.85"/>
        <line x1="512" y1="200" x2="512" y2="680" stroke="#3b82f6" stroke-width="8" opacity="0.3"/>
        <!-- Page lines -->
        <line x1="300" y1="300" x2="480" y2="300" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
        <line x1="300" y1="380" x2="450" y2="380" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
        <line x1="300" y1="460" x2="470" y2="460" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
        <line x1="544" y1="300" x2="724" y2="300" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
        <line x1="544" y1="380" x2="694" y2="380" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
        <line x1="544" y1="460" x2="714" y2="460" stroke="#3b82f6" stroke-width="12" opacity="0.2"/>
      </g>
    </svg>
  `;

  // Generate main icon
  const mainIcon = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  // Save main icon
  fs.writeFileSync(path.join(iconDir, 'icon.png'), mainIcon);
  console.log('Created: icon.png');

  // Generate different sizes
  for (const s of sizes) {
    const resized = await sharp(mainIcon)
      .resize(s, s)
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(iconDir, `icon-${s}x${s}.png`), resized);
    console.log(`Created: icon-${s}x${s}.png`);
  }

  // Create ICO for Windows (using the 256x256 as base)
  console.log('Icons generated successfully!');
}

generateIcon().catch(console.error);
