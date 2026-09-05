/**
 * Metadata extraction and validation.
 *
 * Analyzes EXIF and other embedded metadata for signs of editing,
 * AI generation, or suspicious modifications.
 */

export class MetadataAnalyzer {
  /**
   * Extract and analyze metadata from an image file.
   * @param {File} file - The original file object
   * @returns {Object} Analysis results
   */
  async analyze(file) {
    const result = {
      name: 'Metadata Analysis',
      status: 'info',
      statusLabel: 'Reviewed',
      findings: [],
      raw: {},
      score: 0, // -1 (suspicious) to 0 (neutral)
    };

    try {
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);

      // Parse EXIF from JPEG
      if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
        const exif = this._parseExif(view, buffer);
        result.raw = exif;

        // Check for editing software
        if (exif.software) {
          result.findings.push({
            type: 'info',
            text: `Created/edited with: ${exif.software}`,
          });
        }

        // Check for AI generation markers
        const aiMarkers = ['stable diffusion', 'dall', 'midjourney', 'firefly',
          'generative ai', 'ai generated', 'craiyon', 'deepdream', 'this person does not exist',
          'stylegan', 'biggan', 'clipseg', 'imagen'];
        const allMetaText = JSON.stringify(exif).toLowerCase();

        for (const marker of aiMarkers) {
          if (allMetaText.includes(marker)) {
            result.findings.push({
              type: 'warning',
              text: `AI generation marker detected: "${marker}" found in metadata`,
            });
            result.score = -1;
            result.status = 'warning';
            result.statusLabel = 'AI Markers Found';
          }
        }

        // Check GPS data
        if (exif.gpsLatitude || exif.gpsLongitude) {
          result.findings.push({
            type: 'info',
            text: `GPS location data present: ${exif.gpsLatitude}, ${exif.gpsLongitude}`,
          });
        }

        // Check for multiple edit passes (common in manipulation)
        if (exif.history && exif.history.length > 1) {
          result.findings.push({
            type: 'info',
            text: `Image has ${exif.history.length} modification entries in history`,
          });
        }

        // Check thumbnail consistency
        if (exif.hasThumbnail === false) {
          result.findings.push({
            type: 'info',
            text: 'No EXIF thumbnail present — may indicate metadata stripping or re-saving',
          });
        }

        // Check for suspiciously missing fields
        if (!exif.dateTimeOriginal && !exif.modifyDate) {
          result.findings.push({
            type: 'warning',
            text: 'No date/time metadata present — metadata may have been stripped',
            detail: 'Metadata stripping can indicate intent to hide editing history',
          });
        }

        // Date consistency
        if (exif.dateTimeOriginal && exif.modifyDate) {
          const created = new Date(exif.dateTimeOriginal);
          const modified = new Date(exif.modifyDate);
          if (modified > created) {
            const diffDays = Math.floor((modified - created) / (1000 * 60 * 60 * 24));
            if (diffDays > 30) {
              result.findings.push({
                type: 'info',
                text: `Last modified ${diffDays} days after creation — extended editing period`,
              });
            }
          }
        }
      } else {
        // Non-JPEG: limited metadata analysis
        result.findings.push({
          type: 'info',
          text: `File type "${file.type}" — limited metadata extraction available`,
        });
        result.raw.format = file.type;
      }

      // File size analysis
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > 5) {
        result.findings.push({
          type: 'info',
          text: `Large file size (${sizeMB.toFixed(1)} MB) — may indicate high resolution or unoptimized format`,
        });
      }

      // If no findings, mark as inconclusive
      if (result.findings.length === 0) {
        result.findings.push({
          type: 'info',
          text: 'No significant metadata anomalies detected',
        });
        result.status = 'neutral';
        result.statusLabel = 'No Issues';
      }

    } catch (err) {
      result.status = 'neutral';
      result.statusLabel = 'Limited';
      result.findings.push({
        type: 'info',
        text: `Metadata extraction limited: ${err.message}`,
      });
    }

    return result;
  }

  _parseExif(view, buffer) {
    const exif = {};

    // Check for JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) {
      throw new Error('Not a valid JPEG');
    }

    let offset = 2;
    const length = view.byteLength;

    while (offset < length - 2) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        // APP1 — EXIF
        const exifData = this._parseExifHeader(view, offset + 4);
        Object.assign(exif, exifData);
        break;
      }
      if (marker === 0xFFDA) break; // SOS — start of scan
      const segLen = view.getUint16(offset + 2);
      offset += 2 + segLen;
    }

    return exif;
  }

  _parseExifHeader(view, start) {
    const exif = {};
    try {
      // Check "Exif\0\0"
      const exifStr = String.fromCharCode(
        view.getUint8(start), view.getUint8(start + 1),
        view.getUint8(start + 2), view.getUint8(start + 3)
      );
      if (exifStr !== 'Exif\0\0') return exif;

      const tiffOffset = start + 6;
      const byteOrder = view.getUint16(tiffOffset);
      const littleEndian = byteOrder === 0x4949; // 'II' = Intel byte order
      const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);

      exif.byteOrder = littleEndian ? 'Little-endian' : 'Big-endian';
      exif.ifdOffset = ifdOffset;

      // Parse IFD0
      const ifd0 = this._parseIFD(view, tiffOffset, ifdOffset, littleEndian, tiffOffset);
      Object.assign(exif, ifd0);

    } catch {
      // Malformed EXIF — not necessarily suspicious
    }
    return exif;
  }

  _parseIFD(view, tiffStart, ifdOffset, littleEndian, baseOffset) {
    const result = {};
    const count = view.getUint16(tiffStart + ifdOffset, littleEndian);

    // IFD tag IDs
    const TAGS = {
      0x010F: 'make',
      0x0110: 'model',
      0x0112: 'orientation',
      0x011A: 'xResolution',
      0x011B: 'yResolution',
      0x0131: 'software',
      0x0132: 'dateTime',
      0x013B: 'artist',
      0x8298: 'copyright',
      0x8769: 'exifIFD',
      0x8825: 'gpsIFD',
      0xA005: 'interopIFD',
      0x9003: 'dateTimeOriginal',
      0x9004: 'dateTimeDigitized',
      0xA001: 'colorSpace',
      0xA002: 'pixelXDimension',
      0xA003: 'pixelYDimension',
    };

    for (let i = 0; i < count && i < 50; i++) {
      const entryOffset = tiffStart + ifdOffset + 2 + (i * 12);
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const numValues = view.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;

      const tagName = TAGS[tag];
      if (!tagName) continue;

      try {
        if (type === 2) { // ASCII string
          let strOffset;
          if (numValues <= 4) {
            strOffset = valueOffset;
          } else {
            strOffset = tiffStart + view.getUint32(valueOffset, littleEndian);
          }
          let str = '';
          for (let j = 0; j < numValues && j < 200; j++) {
            const ch = view.getUint8(strOffset + j);
            if (ch === 0) break;
            str += String.fromCharCode(ch);
          }
          result[tagName] = str.trim();
        } else if (type === 3 && numValues === 1) { // SHORT
          result[tagName] = view.getUint16(valueOffset, littleEndian);
        } else if (type === 4 && numValues === 1) { // LONG
          result[tagName] = view.getUint32(valueOffset, littleEndian);
        } else if (type === 5) { // RATIONAL
          const ratOffset = tiffStart + view.getUint32(valueOffset, littleEndian);
          if (ratOffset + 8 <= view.byteLength) {
            const num = view.getUint32(ratOffset, littleEndian);
            const den = view.getUint32(ratOffset + 4, littleEndian);
            result[tagName] = den ? (num / den) : 0;
          }
        }
      } catch {
        // Skip malformed entry
      }
    }

    return result;
  }
}
