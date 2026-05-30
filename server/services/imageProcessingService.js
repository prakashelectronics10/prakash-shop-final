const sharp = require("sharp");
const AppError = require("../utils/AppError");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extractPngFromIco(buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    return buffer;
  }

  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    if (offset + 16 > buffer.length) break;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    const bytes = buffer.readUInt32LE(offset + 8);
    const imageOffset = buffer.readUInt32LE(offset + 12);
    entries.push({ width, height, bytes, imageOffset });
  }

  const entry = entries
    .filter((item) => item.imageOffset + item.bytes <= buffer.length)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];

  if (!entry) return buffer;
  const image = buffer.subarray(entry.imageOffset, entry.imageOffset + entry.bytes);
  if (image.subarray(0, 8).equals(pngSignature)) return image;

  throw new AppError("This ICO file uses an older BMP frame. Please upload a PNG, SVG, or PNG-based ICO favicon.", 400);
}

async function processOgImage(buffer) {
  try {
    const output = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(1200, 630, {
        fit: "cover",
        position: sharp.strategy.attention,
        withoutEnlargement: false,
      })
      .jpeg({
        quality: 82,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: output.data,
      format: "jpg",
      width: output.info.width,
      height: output.info.height,
      bytes: output.info.size,
      contentType: "image/jpeg",
    };
  } catch (error) {
    throw new AppError(`OG image processing failed: ${error.message}`, 400);
  }
}

async function processFavicon(buffer, size = 32) {
  try {
    const input = extractPngFromIco(buffer);
    const output = await sharp(input, { failOn: "none" })
      .rotate()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .png({
        quality: 92,
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: output.data,
      format: "png",
      width: output.info.width,
      height: output.info.height,
      bytes: output.info.size,
      contentType: "image/png",
      size,
    };
  } catch (error) {
    throw new AppError(`Favicon processing failed: ${error.message}`, 400);
  }
}

module.exports = { processOgImage, processFavicon };
