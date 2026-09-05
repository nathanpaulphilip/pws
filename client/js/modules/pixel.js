/**
 * Pixel-level analysis.
 *
 * Detects:
 * - Duplicate/clone regions (copy-move forgery)
 * - Noise pattern inconsistencies
 * - Color distribution anomalies
 * - Edge inconsistency (splicing boundaries)
 */

export class PixelAnalyzer {
  /**
   * Run pixel-level analysis on an image.
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
      name: 'Pixel Analysis',
      status: 'info',
      statusLabel: 'Reviewed',
      findings: [],
      details: {},
      score: 0,
    };

    // --- Noise analysis ---
    const noiseResult = this._analyzeNoise(data, w, h);
    result.details.noise = noiseResult;
    if (noiseResult.inconsistency > 0.3) {
      result.findings.push({
        type: 'warning',
        text: `Noise pattern inconsistency detected (score: ${(noiseResult.inconsistency * 100).toFixed(1)}%)`,
        detail: 'Different noise levels across the image may indicate compositing from multiple sources',
      });
      result.score -= 0.3;
    } else {
      result.findings.push({
        type: 'info',
        text: `Noise pattern analysis: ${(noiseResult.inconsistency * 100).toFixed(1)}% inconsistency`,
      });
    }

    // --- Color distribution ---
    const colorResult = this._analyzeColorDistribution(data, w, h);
    result.details.color = colorResult;
    if (colorResult.anomaly) {
      result.findings.push({
        type: 'warning',
        text: 'Color distribution shows anomalies in specific channels',
        detail: colorResult.anomalyDetail,
      });
      result.score -= 0.2;
    } else {
      result.findings.push({
        type: 'info',
        text: 'Color distribution appears consistent',
      });
    }

    // --- Edge analysis (splicing detection) ---
    const edgeResult = this._analyzeEdges(data, w, h);
    result.details.edges = edgeResult;
    if (edgeResult.suspiciousBoundaries > 0) {
      result.findings.push({
        type: 'warning',
        text: `${edgeResult.suspiciousBoundaries} suspicious boundary regions detected`,
        detail: 'Abrupt edge transitions may indicate compositing or splicing',
      });
      result.score -= 0.3;
    } else {
      result.findings.push({
        type: 'info',
        text: 'Edge transitions appear natural',
      });
    }

    // --- Resolution check ---
    if (w < 200 || h < 200) {
      result.findings.push({
        type: 'info',
        text: `Low resolution (${w}×${h}) — analysis accuracy is reduced for small images`,
      });
    }

    // Aggregate status
    if (result.score < -0.4) {
      result.status = 'warning';
      result.statusLabel = 'Anomalies Detected';
    } else if (result.score < -0.1) {
      result.status = 'info';
      result.statusLabel = 'Minor Variations';
    } else {
      result.status = 'success';
      result.statusLabel = 'Consistent';
    }

    return result;
  }

  /**
   * Analyze noise distribution in blocks.
   */
  _analyzeNoise(data, w, h) {
    const blockSize = Math.max(16, Math.min(64, Math.floor(Math.min(w, h) / 8)));
    const blocksX = Math.floor(w / blockSize);
    const blocksY = Math.floor(h / blockSize);
    const blockNoises = [];

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let noiseSum = 0;
        let count = 0;

        const startX = bx * blockSize;
        const startY = by * blockSize;

        for (let y = startY; y < startY + blockSize - 1; y++) {
          for (let x = startX; x < startX + blockSize - 1; x++) {
            const idx = (y * w + x) * 4;
            const right = (y * w + x + 1) * 4;
            const bottom = ((y + 1) * w + x) * 4;

            const hDiff = Math.abs(data[idx] - data[right]) +
                         Math.abs(data[idx + 1] - data[right + 1]) +
                         Math.abs(data[idx + 2] - data[right + 2]);
            const vDiff = Math.abs(data[idx] - data[bottom]) +
                         Math.abs(data[idx + 1] - data[bottom + 1]) +
                         Math.abs(data[idx + 2] - data[bottom + 2]);

            noiseSum += (hDiff + vDiff) / 6;
            count++;
          }
        }

        if (count > 0) {
          blockNoises.push(noiseSum / count);
        }
      }
    }

    // Calculate noise variance across blocks
    if (blockNoises.length === 0) return { inconsistency: 0 };

    const meanNoise = blockNoises.reduce((a, b) => a + b, 0) / blockNoises.length;
    const variance = blockNoises.reduce((sum, n) => sum + (n - meanNoise) ** 2, 0) / blockNoises.length;
    const stdDev = Math.sqrt(variance);
    const cv = meanNoise > 0 ? stdDev / meanNoise : 0; // coefficient of variation

    return {
      meanNoise: meanNoise.toFixed(2),
      stdDev: stdDev.toFixed(2),
      inconsistency: Math.min(1, cv), // normalize to 0-1
      blockCount: blockNoises.length,
    };
  }

  /**
   * Analyze color channel distributions.
   */
  _analyzeColorDistribution(data, w, h) {
    const channels = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    const total = w * h;

    for (let i = 0; i < data.length; i += 4) {
      channels[0][data[i]]++;
      channels[1][data[i + 1]]++;
      channels[2][data[i + 2]]++;
    }

    // Check for unnatural peaks (e.g., AI-generated images sometimes have
    // suspiciously regular histogram patterns)
    let anomaly = false;
    let anomalyDetail = '';

    const channelNames = ['R', 'G', 'B'];
    const peaks = [];

    for (let c = 0; c < 3; c++) {
      let maxVal = 0;
      let maxIdx = 0;
      for (let i = 0; i < 256; i++) {
        if (channels[c][i] > maxVal) {
          maxVal = channels[c][i];
          maxIdx = i;
        }
      }
      peaks.push({ channel: channelNames[c], peak: maxIdx, count: maxVal });

      // Check for over-representation in any single value (>10% of pixels at one value)
      if (maxVal / total > 0.1) {
        anomaly = true;
        anomalyDetail = `${channelNames[c]} channel has ${(maxVal / total * 100).toFixed(1)}% of pixels at value ${maxIdx}`;
      }
    }

    return { peaks, anomaly, anomalyDetail };
  }

  /**
   * Analyze edge patterns for splicing detection.
   */
  _analyzeEdges(data, w, h) {
    // Simple Sobel edge detection + boundary analysis
    const blockSize = Math.max(32, Math.floor(Math.min(w, h) / 10));
    const blocksX = Math.floor(w / blockSize);
    const blocksY = Math.floor(h / blockSize);

    const edgeStrengths = [];

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let edgeSum = 0;
        let count = 0;

        const startX = bx * blockSize;
        const startY = by * blockSize;

        for (let y = startY + 1; y < startY + blockSize - 1; y++) {
          for (let x = startX + 1; x < startX + blockSize - 1; x++) {
            const idx = (y * w + x) * 4;
            // Sobel kernels (grayscale)
            const gx =
              -1 * this._gray(data, (y - 1) * w + (x - 1)) +
               1 * this._gray(data, (y - 1) * w + (x + 1)) +
              -2 * this._gray(data, y * w + (x - 1)) +
               2 * this._gray(data, y * w + (x + 1)) +
              -1 * this._gray(data, (y + 1) * w + (x - 1)) +
               1 * this._gray(data, (y + 1) * w + (x + 1));

            const gy =
              -1 * this._gray(data, (y - 1) * w + (x - 1)) +
              -2 * this._gray(data, (y - 1) * w + x) +
              -1 * this._gray(data, (y - 1) * w + (x + 1)) +
               1 * this._gray(data, (y + 1) * w + (x - 1)) +
               2 * this._gray(data, (y + 1) * w + x) +
               1 * this._gray(data, (y + 1) * w + (x + 1));

            edgeSum += Math.sqrt(gx * gx + gy * gy);
            count++;
          }
        }

        if (count > 0) {
          edgeStrengths.push({
            x: bx,
            y: by,
            strength: edgeSum / count,
          });
        }
      }
    }

    // Find suspiciously sharp boundaries between adjacent blocks
    let suspiciousBoundaries = 0;
    for (let i = 0; i < edgeStrengths.length; i++) {
      for (let j = i + 1; j < edgeStrengths.length; j++) {
        const dx = Math.abs(edgeStrengths[i].x - edgeStrengths[j].x);
        const dy = Math.abs(edgeStrengths[i].y - edgeStrengths[j].y);
        if (dx + dy === 1) { // adjacent blocks
          const diff = Math.abs(edgeStrengths[i].strength - edgeStrengths[j].strength);
          const avg = (edgeStrengths[i].strength + edgeStrengths[j].strength) / 2;
          if (avg > 0 && diff / avg > 2.0) {
            suspiciousBoundaries++;
          }
        }
      }
    }

    return { suspiciousBoundaries, blockCount: edgeStrengths.length };
  }

  _gray(data, idx) {
    return (data[idx * 4] * 0.299 + data[idx * 4 + 1] * 0.587 + data[idx * 4 + 2] * 0.114);
  }
}
