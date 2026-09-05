/**
 * Error Level Analysis (ELA).
 *
 * Re-saves the image at a known JPEG quality, computes the pixel-wise
 * difference, and highlights regions with abnormally high error — which
 * often correspond to spliced or pasted-in regions.
 *
 * Threat mitigated:
 * - Detects copy-move forgery and compositing by revealing regions
 *   whose compression characteristics differ from the rest of the image.
 */

export class ELAAnalyzer {
  /**
   * Run ELA on an image element.
   * @param {HTMLImageElement} img
   * @param {number} [quality=75] — JPEG re-save quality
   * @returns {Object} analysis result with canvas data and metrics
   */
  analyze(img, quality = 75) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // 1. Draw original
    const origCanvas = document.createElement('canvas');
    origCanvas.width = w;
    origCanvas.height = h;
    const origCtx = origCanvas.getContext('2d');
    origCtx.drawImage(img, 0, 0);

    // 2. Re-save at known quality via toBlob → Image → Canvas (async path)
    const reencodedCanvas = document.createElement('canvas');
    reencodedCanvas.width = w;
    reencodedCanvas.height = h;
    const reencodedCtx = reencodedCanvas.getContext('2d');

    const dataUrl = origCanvas.toDataURL('image/jpeg', quality / 100);

    // Create a JPEG blob and re-draw it
    return new Promise((resolve) => {
      origCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const reloaded = new Image();
        reloaded.onload = () => {
          reencodedCtx.drawImage(reloaded, 0, 0);
          URL.revokeObjectURL(url);

          // 3. Compute difference
          const origData = origCtx.getImageData(0, 0, w, h);
          const resavedData = reencodedCtx.getImageData(0, 0, w, h);

          const elaCanvas = document.createElement('canvas');
          elaCanvas.width = w;
          elaCanvas.height = h;
          const elaCtx = elaCanvas.getContext('2d');
          const elaData = elaCtx.createImageData(w, h);

          let totalDiff = 0;
          let maxDiff = 0;
          let highDiffPixels = 0;
          const diffValues = new Uint8Array(w * h);

          for (let i = 0; i < origData.data.length; i += 4) {
            const diffR = Math.abs(origData.data[i] - resavedData.data[i]);
            const diffG = Math.abs(origData.data[i + 1] - resavedData.data[i + 1]);
            const diffB = Math.abs(origData.data[i + 2] - resavedData.data[i + 2]);
            const diff = (diffR + diffG + diffB) / 3;

            totalDiff += diff;
            if (diff > maxDiff) maxDiff = diff;
            const pixelIdx = i / 4;
            diffValues[pixelIdx] = diff;

            if (diff > 25) highDiffPixels++; // threshold for "suspicious"

            // Amplify and visualize
            const amplified = Math.min(255, diff * 5);
            elaData.data[i] = amplified;
            elaData.data[i + 1] = amplified * 0.3;
            elaData.data[i + 2] = amplified * 0.2;
            elaData.data[i + 3] = 255;
          }

          elaCtx.putImageData(elaData, 0, 0);

          const totalPixels = w * h;
          const avgDiff = totalDiff / totalPixels;
          const highDiffPercent = (highDiffPixels / totalPixels) * 100;

          // Compute standard deviation for anomaly detection
          let variance = 0;
          for (let i = 0; i < diffValues.length; i++) {
            variance += (diffValues[i] - avgDiff) ** 2;
          }
          const stdDev = Math.sqrt(variance / totalPixels);

          // Determine status
          let status = 'success';
          let statusLabel = 'Consistent';
          let score = 0;

          if (highDiffPercent > 15) {
            status = 'danger';
            statusLabel = 'Significant Variation';
            score = -1;
          } else if (highDiffPercent > 5 || stdDev > 15) {
            status = 'warning';
            statusLabel = 'Moderate Variation';
            score = -0.5;
          }

          resolve({
            elaCanvas,
            avgDiff: avgDiff.toFixed(2),
            maxDiff,
            stdDev: stdDev.toFixed(2),
            highDiffPercent: highDiffPercent.toFixed(1),
            totalPixels,
            quality,
            status,
            statusLabel,
            score,
          });
        };

        reloaded.onerror = () => {
          // Fallback: use original canvas as ELA result
          resolve({
            elaCanvas: origCanvas,
            avgDiff: 0,
            maxDiff: 0,
            stdDev: 0,
            highDiffPercent: 0,
            totalPixels: w * h,
            quality,
            status: 'neutral',
            statusLabel: 'Could Not Compute',
            score: 0,
          });
        };

        reloaded.src = dataUrl;
      }, 'image/jpeg', quality / 100);
    });
  }
}
