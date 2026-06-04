const fs = require('fs');
const { createCanvas } = (() => {
  try { return require('canvas'); } catch(e) { return {}; }
})();

// Create simple SVG icons as PNG-like files (using raw binary PNG generation)
function createMinimalPNG(size, outPath) {
  // Create a simple 1x1 dark pixel PNG and scale conceptually
  // For a real PWA we just need valid files - they'll work as placeholders
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#070709"/>
    <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="${Math.floor(size*0.35)}" fill="#E11D48">CM</text>
  </svg>`;
  
  // Save as SVG (browsers accept SVGs in manifest icons with type image/svg+xml)
  fs.writeFileSync(outPath.replace('.png', '.svg'), svg);
  console.log(`Created ${outPath.replace('.png', '.svg')}`);
}

createMinimalPNG(192, 'public/icon-192.png');
createMinimalPNG(512, 'public/icon-512.png');
console.log('SVG icons created!');
