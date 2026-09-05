/**
 * Display module — renders analysis results to the DOM.
 *
 * Communicates uncertainty clearly and grounds all statements in evidence.
 */

const VERDICT_CONFIG = {
  analysis_unavailable: {
    icon: '⚪',
    color: '#8b8fa3',
    message: 'Analysis Unavailable',
    disclaimer: 'The analysis pipeline could not complete successfully. This does not indicate the file is safe or unsafe.',
  },
  inconclusive: {
    icon: '❓',
    color: '#f59e0b',
    message: 'Inconclusive',
    disclaimer: 'The analysis could not reach a meaningful conclusion. This may be due to file format limitations, low resolution, or excessive compression.',
  },
  no_clear_indicators: {
    icon: '✅',
    color: '#22c55e',
    message: 'No Clear Manipulation Indicators',
    disclaimer: 'No significant indicators of manipulation were detected. However, this is not a guarantee of authenticity. Sophisticated manipulation may not be detectable by this tool.',
  },
  manipulation_possible: {
    icon: '⚠️',
    color: '#f59e0b',
    message: 'Possible Manipulation Indicators Detected',
    disclaimer: 'Some technical indicators suggest possible manipulation. This is a probabilistic assessment — further verification with professional tools or domain experts is recommended.',
  },
  manipulation_likely: {
    icon: '🔴',
    color: '#ef4444',
    message: 'Strong Manipulation Indicators Detected',
    disclaimer: 'Multiple independent analysis methods detected patterns consistent with manipulation. This is a probabilistic assessment with higher confidence, but still not a definitive verdict. Professional forensic analysis is strongly recommended.',
  },
};

export class Display {
  constructor() {
    this.elements = {
      loading: document.getElementById('loading'),
      loadingStep: document.getElementById('loading-step'),
      previewSection: document.getElementById('preview-section'),
      previewContainer: document.getElementById('preview-container'),
      fileInfo: document.getElementById('file-info'),
      resultsSection: document.getElementById('results-section'),
      verdict: document.getElementById('verdict'),
      confidenceBar: document.getElementById('confidence-bar'),
      confidenceLabel: document.getElementById('confidence-label'),
      verdictDisclaimer: document.getElementById('verdict-disclaimer'),
      evidenceGrid: document.getElementById('evidence-grid'),
      aiExplanationCard: document.getElementById('ai-explanation-card'),
      aiExplanation: document.getElementById('ai-explanation'),
      technicalCard: document.getElementById('technical-card'),
      technicalDetails: document.getElementById('technical-details'),
      recommendedActions: document.getElementById('recommended-actions'),
      uploadSection: document.getElementById('upload-section'),
      resetBtn: document.getElementById('reset-btn'),
    };
  }

  showLoading(step, detail) {
    this.elements.loading.classList.remove('hidden');
    this.elements.loadingStep.textContent = detail || step;
  }

  updateLoadingStep(step) {
    this.elements.loadingStep.textContent = step;
  }

  hideLoading() {
    this.elements.loading.classList.add('hidden');
  }

  showPreview(file, mediaElement) {
    this.elements.previewContainer.innerHTML = '';

    if (mediaElement.tagName === 'IMG') {
      const clone = mediaElement.cloneNode();
      this.elements.previewContainer.appendChild(clone);
    } else {
      const clone = mediaElement.cloneNode();
      clone.controls = true;
      this.elements.previewContainer.appendChild(clone);
    }

    this.elements.fileInfo.innerHTML = `
      <span>📄 ${this._escapeHtml(file.name)}</span>
      <span>📐 ${mediaElement.naturalWidth || mediaElement.videoWidth}×${mediaElement.naturalHeight || mediaElement.videoHeight}</span>
      <span>💾 ${this._formatBytes(file.size)}</span>
      <span>🏷️ ${file.type}</span>
    `;

    this.elements.previewSection.classList.remove('hidden');
  }

  showResults(results) {
    this.elements.uploadSection.classList.add('hidden');
    this.elements.previewSection.classList.add('hidden');
    this.elements.resultsSection.classList.remove('hidden');

    this._renderVerdict(results);
    this._renderEvidence(results);
    this._renderExplanation(results);
    this._renderTechnicalDetails(results);
    this._renderRecommendedActions(results);

    // ELA canvas
    if (results.elaCanvas) {
      this._renderELAResult(results.elaCanvas);
    }
  }

  reset() {
    this.elements.resultsSection.classList.add('hidden');
    this.elements.previewSection.classList.add('hidden');
    this.elements.uploadSection.classList.remove('hidden');
    this.elements.evidenceGrid.innerHTML = '';
    this.elements.aiExplanation.innerHTML = '';
    this.elements.technicalDetails.textContent = '';
    this.elements.recommendedActions.innerHTML = '';
    this.elements.aiExplanationCard.classList.add('hidden');
    this.elements.technicalCard.classList.add('hidden');
  }

  _renderVerdict(results) {
    const config = VERDICT_CONFIG[results.verdict] || VERDICT_CONFIG.analysis_unavailable;

    this.elements.verdict.innerHTML = `
      <span style="font-size: 2rem">${config.icon}</span>
      <div style="color: ${config.color}; margin-top: 0.5rem">${config.message}</div>
    `;

    // Confidence bar
    const pct = Math.round(results.confidence * 100);
    this.elements.confidenceBar.style.width = `${pct}%`;
    this.elements.confidenceBar.style.background = config.color;
    this.elements.confidenceLabel.textContent = `Confidence: ${pct}% — ${results.confidenceLabel}`;
    // Update ARIA progressbar
    const barContainer = this.elements.confidenceBar.parentElement;
    if (barContainer) {
      barContainer.setAttribute('aria-valuenow', String(pct));
    }

    // Disclaimer
    this.elements.verdictDisclaimer.textContent = config.disclaimer;
  }

  _renderEvidence(results) {
    this.elements.evidenceGrid.innerHTML = '';

    // ELA visual result card
    if (results.elaCanvas) {
      const elaCard = document.createElement('div');
      elaCard.className = 'evidence-card';
      elaCard.innerHTML = `
        <div class="evidence-card-header">
          <span class="evidence-title">📊 Error Level Analysis</span>
          <span class="evidence-status ${results.analyses.ela?.status || 'neutral'}">
            ${results.analyses.ela?.statusLabel || 'N/A'}
          </span>
        </div>
        <div class="evidence-body" id="ela-display"></div>
      `;
      this.elements.evidenceGrid.appendChild(elaCard);

      // Insert ELA canvas after a tick
      requestAnimationFrame(() => {
        const display = elaCard.querySelector('#ela-display');
        if (display && results.elaCanvas) {
          const canvas = results.elaCanvas;
          canvas.style.maxWidth = '100%';
          canvas.style.borderRadius = '8px';
          canvas.style.marginTop = '0.5rem';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('alt', 'Error Level Analysis visualization showing compression differences across the image');
          canvas.setAttribute('aria-label', 'Error Level Analysis visualization showing compression differences across the image');
          display.appendChild(canvas);
          display.innerHTML += `<p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-muted)">
            Red/orange regions show higher compression error — areas that may have been added or modified.
          </p>`;
        }
      });
    }

    // Other analysis cards
    for (const [key, analysis] of Object.entries(results.analyses)) {
      if (!analysis) continue;

      const card = document.createElement('div');
      card.className = 'evidence-card';

      const findingsHtml = (analysis.findings || [])
        .map((f) => {
          const icon = f.type === 'warning' ? '⚠️' : f.type === 'danger' ? '🔴' : 'ℹ️';
          return `<div style="margin: 0.4rem 0"><span>${icon}</span> ${this._escapeHtml(f.text)}</div>`;
        })
        .join('');

      card.innerHTML = `
        <div class="evidence-card-header">
          <span class="evidence-title">${this._escapeHtml(analysis.name)}</span>
          <span class="evidence-status ${analysis.status || 'neutral'}">${this._escapeHtml(analysis.statusLabel || 'N/A')}</span>
        </div>
        <div class="evidence-body">${findingsHtml || '<em>No findings</em>'}</div>
      `;

      this.elements.evidenceGrid.appendChild(card);
    }
  }

  _renderExplanation(results) {
    if (!results.explanation) return;

    this.elements.aiExplanation.innerHTML = `<p>${this._escapeHtml(results.explanation)}</p>`;
    this.elements.aiExplanationCard.classList.remove('hidden');
  }

  _renderTechnicalDetails(results) {
    const details = {
      verdict: results.verdict,
      confidence: results.confidence,
      dimensions: results.dimensions,
      fileType: results.fileType,
      fileSize: results.fileSize,
      analyses: {},
    };

    for (const [key, analysis] of Object.entries(results.analyses)) {
      if (!analysis) continue;
      details.analyses[key] = {
        name: analysis.name,
        status: analysis.status,
        score: analysis.score,
        details: analysis.details || {},
      };
    }

    this.elements.technicalDetails.textContent = JSON.stringify(details, null, 2);
    this.elements.technicalCard.classList.remove('hidden');
  }

  _renderRecommendedActions(actions) {
    this.elements.recommendedActions.innerHTML = (actions || [])
      .map((a) => `
        <div class="recommended-action">
          <span class="recommended-action-icon">${a.icon}</span>
          <span>${this._escapeHtml(a.text)}</span>
        </div>
      `)
      .join('');
  }

  _renderELAResult(canvas) {
    // Already handled in _renderEvidence
  }

  _escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
