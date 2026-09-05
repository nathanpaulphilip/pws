/**
 * Analysis Pipeline — orchestrates all analysis modules and produces
 * a unified result with verdict, confidence, and evidence.
 *
 * Design principles:
 * - Every finding is grounded in technical evidence
 * - No definitive authenticity verdicts
 * - Clear communication of uncertainty
 * - Graceful handling of failures
 */

import { MetadataAnalyzer } from './metadata.js';
import { ELAAnalyzer } from './ela.js';
import { PixelAnalyzer } from './pixel.js';
import { FrequencyAnalyzer } from './frequency.js';

export class AnalysisPipeline {
  constructor() {
    this.metadata = new MetadataAnalyzer();
    this.ela = new ELAAnalyzer();
    this.pixel = new PixelAnalyzer();
    this.frequency = new FrequencyAnalyzer();
  }

  /**
   * Run the full analysis pipeline on a media file.
   * @param {File} file — original file
   * @param {HTMLImageElement|HTMLVideoElement} mediaElement — loaded media
   * @param {Function} onProgress — progress callback (step, detail)
   * @returns {Object} complete analysis result
   */
  async run(file, mediaElement, onProgress = () => {}) {
    const results = {
      timestamp: new Date().toISOString(),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      dimensions: { width: 0, height: 0 },
      analyses: {},
      elaCanvas: null,
      verdict: null,
      confidence: 0,
      confidenceLabel: '',
      explanation: '',
      recommendedActions: [],
    };

    const allFindings = [];
    let totalScore = 0;
    let analyzedCount = 0;

    // Get dimensions
    if (mediaElement.tagName === 'IMG') {
      results.dimensions.width = mediaElement.naturalWidth;
      results.dimensions.height = mediaElement.naturalHeight;
    } else {
      results.dimensions.width = mediaElement.videoWidth;
      results.dimensions.height = mediaElement.videoHeight;
    }

    // --- Step 1: Metadata Analysis ---
    try {
      onProgress('metadata', 'Extracting and validating metadata...');
      const metaResult = await this.metadata.analyze(file);
      results.analyses.metadata = metaResult;
      allFindings.push(...metaResult.findings);
      totalScore += metaResult.score;
      analyzedCount++;
    } catch (err) {
      results.analyses.metadata = {
        name: 'Metadata Analysis',
        status: 'neutral',
        statusLabel: 'Failed',
        findings: [{ type: 'info', text: `Metadata analysis failed: ${err.message}` }],
        score: 0,
      };
    }

    // --- Step 2: Error Level Analysis (images only) ---
    if (file.type.startsWith('image/') && mediaElement.tagName === 'IMG') {
      try {
        onProgress('ela', 'Running Error Level Analysis...');
        const elaResult = await this.ela.analyze(mediaElement);
        results.analyses.ela = elaResult;
        results.elaCanvas = elaResult.elaCanvas;
        totalScore += elaResult.score;
        analyzedCount++;

        if (elaResult.score < -0.5) {
          allFindings.push({
            type: 'warning',
            text: 'ELA reveals significant compression inconsistencies',
            detail: `Average error: ${elaResult.avgDiff}, High-error pixels: ${elaResult.highDiffPercent}%`,
          });
        } else {
          allFindings.push({
            type: 'info',
            text: `ELA compression analysis: ${elaResult.statusLabel}`,
            detail: `Average error: ${elaResult.avgDiff}, StdDev: ${elaResult.stdDev}`,
          });
        }
      } catch (err) {
        results.analyses.ela = {
          name: 'Error Level Analysis',
          status: 'neutral',
          statusLabel: 'Failed',
          findings: [{ type: 'info', text: `ELA failed: ${err.message}` }],
          score: 0,
        };
      }
    }

    // --- Step 3: Pixel Analysis (images only) ---
    if (file.type.startsWith('image/') && mediaElement.tagName === 'IMG') {
      try {
        onProgress('pixel', 'Analyzing pixel patterns and noise...');
        const pixelResult = this.pixel.analyze(mediaElement);
        results.analyses.pixel = pixelResult;
        allFindings.push(...pixelResult.findings);
        totalScore += pixelResult.score;
        analyzedCount++;
      } catch (err) {
        results.analyses.pixel = {
          name: 'Pixel Analysis',
          status: 'neutral',
          statusLabel: 'Failed',
          findings: [{ type: 'info', text: `Pixel analysis failed: ${err.message}` }],
          score: 0,
        };
      }
    }

    // --- Step 4: Frequency Analysis (images only) ---
    if (file.type.startsWith('image/') && mediaElement.tagName === 'IMG') {
      try {
        onProgress('frequency', 'Analyzing frequency domain...');
        const freqResult = this.frequency.analyze(mediaElement);
        results.analyses.frequency = freqResult;
        allFindings.push(...freqResult.findings);
        totalScore += freqResult.score;
        analyzedCount++;
      } catch (err) {
        results.analyses.frequency = {
          name: 'Frequency Analysis',
          status: 'neutral',
          statusLabel: 'Failed',
          findings: [{ type: 'info', text: `Frequency analysis failed: ${err.message}` }],
          score: 0,
        };
      }
    }

    // --- Compute Verdict ---
    onProgress('verdict', 'Computing results...');

    if (analyzedCount === 0) {
      results.verdict = 'analysis_unavailable';
      results.confidence = 0;
      results.confidenceLabel = 'Analysis Unavailable';
      results.explanation = 'No analysis modules could run successfully. This may be due to an unsupported file format or a processing error. Please try a different file.';
    } else {
      const avgScore = totalScore / analyzedCount;
      results.confidence = this._computeConfidence(avgScore, analyzedCount, allFindings);

      if (results.confidence < 0.2) {
        results.verdict = 'inconclusive';
        results.confidenceLabel = 'Inconclusive';
      } else if (avgScore < -0.5 && results.confidence > 0.5) {
        results.verdict = 'manipulation_likely';
        results.confidenceLabel = 'Manipulation Indicators Detected';
      } else if (avgScore < -0.2) {
        results.verdict = 'manipulation_possible';
        results.confidenceLabel = 'Possible Manipulation Indicators';
      } else {
        results.verdict = 'no_clear_indicators';
        results.confidenceLabel = 'No Clear Manipulation Indicators';
      }

      // Generate explanation grounded in findings
      results.explanation = this._generateExplanation(results, allFindings);
    }

    // Generate recommended actions
    results.recommendedActions = this._generateRecommendations(results);

    return results;
  }

  /**
   * Compute confidence score (0-1) based on analysis results.
   */
  _computeConfidence(avgScore, analyzedCount, findings) {
    // Base confidence from number of analyses that ran
    const moduleConfidence = Math.min(1, analyzedCount / 4);

    // Signal strength from findings
    const warnings = findings.filter((f) => f.type === 'warning').length;
    const totalFindings = findings.length;
    const signalStrength = totalFindings > 0 ? Math.min(1, warnings / Math.max(1, totalFindings * 0.5)) : 0;

    // Combine: more analyses = more confidence; stronger signals = more confidence
    let confidence = moduleConfidence * 0.6 + signalStrength * 0.4;

    // Clamp
    confidence = Math.max(0, Math.min(1, confidence));

    return confidence;
  }

  /**
   * Generate an explanation grounded exclusively in the evidence.
   */
  _generateExplanation(results, findings) {
    if (results.verdict === 'analysis_unavailable') {
      return 'Analysis could not be completed. Please try uploading the file directly.';
    }

    if (results.verdict === 'inconclusive') {
      return 'The analysis could not produce a reliable result. This may be because the file type has limited support, ' +
        'the image is too small or too compressed, or the analysis modules encountered errors. ' +
        'For reliable results, try uploading a high-quality JPEG image.';
    }

    const warnings = findings.filter((f) => f.type === 'warning');
    const infoFindings = findings.filter((f) => f.type === 'info');

    let explanation = '';

    if (results.verdict === 'no_clear_indicators') {
      explanation = 'Based on the technical evidence gathered, no clear indicators of manipulation or AI generation were found. ';
      explanation += `The analysis examined metadata, compression patterns, pixel statistics, and frequency characteristics. `;
      explanation += `However, absence of evidence is not evidence of absence — sophisticated manipulation may not be detectable by these methods.`;
    } else {
      explanation = `The analysis identified ${warnings.length} potential indicator${warnings.length > 1 ? 's' : ''} that may suggest manipulation. `;
      explanation += 'Specific findings include: ';
      explanation += warnings.map((w) => w.text).join('; ') + '. ';
      explanation += 'These are technical observations, not definitive proof. ';
      explanation += 'The confidence level reflects the strength and consistency of these indicators across multiple analysis methods.';
    }

    return explanation;
  }

  /**
   * Generate recommended next steps based on results.
   */
  _generateRecommendations(results) {
    const actions = [];

    if (results.verdict === 'analysis_unavailable') {
      actions.push({
        icon: '🔄',
        text: 'Try uploading the file directly instead of using a URL',
      });
      actions.push({
        icon: '📋',
        text: 'Verify the file is not corrupted and is in a supported format',
      });
      return actions;
    }

    if (results.verdict === 'inconclusive') {
      actions.push({
        icon: '📷',
        text: 'Try uploading a higher-quality version of the image (JPEG format recommended)',
      });
      actions.push({
        icon: '🔍',
        text: 'Cross-reference with reverse image search tools (e.g., TinEye, Google Images)',
      });
      return actions;
    }

    // Always recommend cross-referencing
    actions.push({
      icon: '🔍',
      text: 'Cross-reference with reverse image search tools (e.g., TinEye, Google Images)',
    });

    if (results.verdict !== 'no_clear_indicators') {
      actions.push({
        icon: '📸',
        text: 'Look for the original source of the image and verify the context',
      });
      actions.push({
        icon: '🔬',
        text: 'For high-stakes decisions, use professional forensic analysis tools (e.g., FotoForensics, Forensically)',
      });
      actions.push({
        icon: '📰',
        text: 'Check if the image has been reported or fact-checked by news organizations',
      });
    }

    if (results.verdict === 'no_clear_indicators') {
      actions.push({
        icon: '📰',
        text: 'Verify the context and source of the image through news outlets or official channels',
      });
      actions.push({
        icon: '🤖',
        text: 'Consider that AI detection is probabilistic — no tool can guarantee 100% accuracy',
      });
    }

    return actions;
  }
}
