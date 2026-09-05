/**
 * Frequency domain analysis.
 *
 * Uses DCT-like analysis to detect:
 * - JPEG compression grid inconsistencies
 * - Frequency spectrum anomalies typical of AI generation
 * - Upsampling or scaling artifacts
 */

export class FrequencyAnalyzer {
  /**
   * Analyze frequency characteristics of an image.
   * @param {HTMLImageElement} img
   * @returns {Object} analysis result
   */
  analyze(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const result = {
      name: 'Frequency Analysis',
      status: 'info',
      statusLabel: 'Reviewed',
      findings: [],
      details: {},
      score: 0,
    };

    // --- JPEG grid detection ---
    const gridResult = this._detectJPEGGrid(data, w, h);
    result.details.jpgGrid = gridResult;
    if (gridResult.inconsistencies > 0) {
      result.findings.push({
        type: 'warning',
        text: `JPEG compression grid has ${gridResult.inconsistencies} inconsistency regions`,
        detail: 'Inconsistent JPEG grids may indicate that regions were independently compressed (compositing)',
      });
      result.score -= 0.3;
    } else {
      result.findings.push({
        type: 'info',
        text: 'JPEG compression grid appears consistent across the image',
      });
    }

    // --- Color frequency spectrum ---
    const spectrumResult = this._analyzeSpectrum(data, w, h);
    result.details.spectrum = spectrumResult;

    if (spectrumResult.aiLikeSpectrum) {
      result.findings.push({
        type: 'warning',
        text: 'Frequency spectrum shows patterns consistent with AI-generated content',
        detail: 'AI-generated images often exhibit characteristic frequency signatures',
      });
      result.score -= 0.2;
    } else {
      result.findings.push({
        type: 'info',
        text: 'Frequency spectrum analysis shows no clear AI-generation signatures',
      });
    }

    // --- Periodic pattern detection ---
    const patternResult = this._detectPeriodicPatterns(data, w, h);
    result.details.patterns = patternResult;
    if (patternResult.anomalies > 0) {
      result.findings.push({
        type: 'info',
        text: `${patternResult.anomalies} periodic artifact regions detected`,
        detail: 'Periodic artifacts may come from sensor patterns, compression, or generation artifacts',
      });
    }

    // Aggregate
    if (result.score < -0.3) {
      result.status = 'warning';
      result.statusLabel = 'Anomalies Found';
    } else {
      result.status = 'success';
      result.statusLabel = 'Consistent';
    }

    return result;
  }

  /**
   * Detect JPEG 8x8 compression grid inconsistencies.
   */
  _detectJPEGGrid(data, w, h) {
    // Sample rows at 8-pixel intervals to detect grid boundaries
    const gridPitch = 8;
    let inconsistencies = 0;
    const sampleCount = Math.min(50, Math.floor(h / gridPitch));

    for (let s = 0; s < sampleCount; s++) {
      const y = Math.floor(Math.random() * h);
      let maxDiff = 0;

      for (let x = gridPitch; x < w - 1; x += gridPitch) {
        const idx = (y * w + x) * 4;
        const prev = (y * w + x - 1) * 4;
        const next = (y * w + x + 1) * 4;

        // Check for abrupt brightness change at grid boundary
        const diffLeft = Math.abs(data[idx] - data[prev]) +
                        Math.abs(data[idx + 1] - data[prev + 1]) +
                        Math.abs(data[idx + 2] - data[prev + 2]);
        const diffRight = Math.abs(data[idx] - data[next]) +
                         Math.abs(data[idx + 1] - data[next + 1]) +
                         Math.abs(data[idx + 2] - data[next + 2]);

        const ratio = diffLeft > 0 && diffRight > 0 ? Math.max(diffLeft, diffRight) / Math.min(diffLeft, diffRight) : 1;
        if (ratio > 3) maxDiff = Math.max(maxDiff, ratio);
      }

      if (maxDiff > 5) inconsistencies++;
    }

    return { inconsistencies, sampleCount };
  }

  /**
   * Analyze the 2D frequency spectrum characteristics.
   */
  _analyzeSpectrum(data, w, h) {
    // Convert to grayscale for spectral analysis
    const gray = new Float64Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    }

    // Compute horizontal and vertical frequency profiles using simple differencing
    const blockSize = Math.max(8, Math.floor(Math.min(w, h) / 16));
    const blocksX = Math.floor(w / blockSize);
    const blocksY = Math.floor(h / blockSize);

    const hfEnergy = new Float64Array(blocksX * blocksY); // high-frequency energy per block
    const lfEnergy = new Float64Array(blocksX * blocksY); // low-frequency energy per block

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let hf = 0, lf = 0;
        let count = 0;

        for (let y = by * blockSize + 1; y < (by + 1) * blockSize - 1; y++) {
          for (let x = bx * blockSize + 1; x < (bx + 1) * blockSize - 1; x++) {
            const idx = y * w + x;
            // Laplacian approximation (high-pass)
            const laplacian = Math.abs(
              -4 * gray[idx] +
              gray[idx - 1] + gray[idx + 1] +
              gray[idx - w] + gray[idx + w]
            );
            hf += laplacian;
            lf += gray[idx];
            count++;
          }
        }

        if (count > 0) {
          hfEnergy[by * blocksX + bx] = hf / count;
          lfEnergy[by * blocksX + bx] = lf / count;
        }
      }
    }

    // Check for AI-typical patterns: abnormally uniform high-frequency energy
    let meanHF = 0;
    for (let i = 0; i < hfEnergy.length; i++) meanHF += hfEnergy[i];
    meanHF /= hfEnergy.length;

    let varianceHF = 0;
    for (let i = 0; i < hfEnergy.length; i++) {
      varianceHF += (hfEnergy[i] - meanHF) ** 2;
    }
    varianceHF /= hfEnergy.length;

    // AI-generated images tend to have more uniform HF energy (lower variance)
    const cvHF = meanHF > 0 ? Math.sqrt(varianceHF) / meanHF : 0;
    const aiLikeSpectrum = cvHF < 0.3 && meanHF > 0;

    return {
      meanHF: meanHF.toFixed(2),
      cvHF: cvHF.toFixed(3),
      aiLikeSpectrum,
      blockCount: blocksX * blocksY,
    };
  }

  /**
   * Detect periodic patterns in pixel differences.
   */
  _detectPeriodicPatterns(data, w, h) {
    // Check horizontal rows for periodic artifacts
    const sampleRows = Math.min(20, h);
    let anomalies = 0;

    for (let s = 0; s < sampleRows; s++) {
      const y = Math.floor((s / sampleRows) * h);
      const diffs = new Float64Array(w - 1);

      for (let x = 0; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const next = (y * w + x + 1) * 4;
        diffs[x] = Math.abs(data[idx] - data[next]) +
                   Math.abs(data[idx + 1] - data[next + 1]) +
                   Math.abs(data[idx + 2] - data[next + 2]);
      }

      // Simple autocorrelation check for period-4, period-8 patterns
      for (const period of [4, 8]) {
        let correlation = 0;
        let count = 0;
        for (let i = 0; i < diffs.length - period; i++) {
          correlation += Math.abs(diffs[i] - diffs[i + period]);
          count++;
        }
        if (count > 0) {
          const avgCorr = correlation / count;
          const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
          if (avgDiff > 0 && avgCorr / avgDiff < 0.1) {
            anomalies++;
            break;
          }
        }
      }
    }

    return { anomalies, sampleRows };
  }
}
