/**
 * Freebuff Desktop — Main Application
 *
 * Handles file input, URL fetching, and orchestrates the analysis pipeline.
 * All analysis runs entirely in the browser for maximum privacy.
 */

import { AnalysisPipeline } from './modules/analysis.js';
import { Display } from './modules/display.js';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/bmp', 'image/tiff',
  'video/mp4', 'video/webm', 'video/quicktime',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

class App {
  constructor() {
    this.pipeline = new AnalysisPipeline();
    this.display = new Display();
    this.currentFile = null;

    this._initElements();
    this._bindEvents();
  }

  _initElements() {
    this.dropZone = document.getElementById('drop-zone');
    this.fileInput = document.getElementById('file-input');
    this.urlInput = document.getElementById('url-input');
    this.urlSubmit = document.getElementById('url-submit');
    this.resetBtn = document.getElementById('reset-btn');
  }

  _bindEvents() {
    // Click to upload
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput.click();
      }
    });

    // File input
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this._handleFile(e.target.files[0]);
      }
    });

    // Drag & drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this._handleFile(e.dataTransfer.files[0]);
      }
    });

    // URL input
    this.urlInput.addEventListener('input', () => {
      this.urlSubmit.disabled = !this.urlInput.value.trim();
    });
    this.urlSubmit.addEventListener('click', () => this._handleUrl());
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.urlInput.value.trim()) {
        this._handleUrl();
      }
    });

    // Reset
    this.resetBtn.addEventListener('click', () => {
      this.display.reset();
      this.fileInput.value = '';
      this.urlInput.value = '';
      this.urlSubmit.disabled = true;
    });
  }

  async _handleFile(file) {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      this._showError(`Unsupported file type: "${file.type || 'unknown'}". Please upload an image or video.`);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      this._showError(`File too large (${this._formatBytes(file.size)}). Maximum size is 10 MB.`);
      return;
    }

    if (file.size === 0) {
      this._showError('File is empty.');
      return;
    }

    this.currentFile = file;
    this._runAnalysis(file);
  }

  async _handleUrl() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    // Basic URL validation
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      this._showError('Invalid URL. Please enter a valid http or https URL.');
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      this._showError('Only http and https URLs are supported.');
      return;
    }

    // SSRF protection — block localhost and private IPs
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host === '::1') {
      this._showError('URLs to localhost are not allowed for security reasons.');
      return;
    }

    // Block private IP ranges
    if (/^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      this._showError('URLs to private/internal networks are not allowed.');
      return;
    }

    this.display.showLoading('fetch', 'Fetching image from URL...');

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!ALLOWED_TYPES.some((t) => contentType.includes(t.split('/')[1]))) {
        throw new Error(`URL does not serve a supported media type (got: ${contentType})`);
      }

      const blob = await response.blob();
      if (blob.size > MAX_FILE_SIZE) {
        throw new Error(`File too large (${this._formatBytes(blob.size)})`);
      }

      const file = new File([blob], this._extractFilenameFromUrl(url, contentType), {
        type: contentType.split(';')[0].trim(),
      });

      this.currentFile = file;
      await this._runAnalysis(file);
    } catch (err) {
      this.display.hideLoading();
      this._showError(`Failed to fetch URL: ${err.message}. The URL may be blocked by CORS or may not serve a supported media type.`);
    }
  }

  async _runAnalysis(file) {
    try {
      // Load media element
      this.display.showLoading('load', 'Loading media...');

      let mediaElement;
      if (file.type.startsWith('video/')) {
        mediaElement = await this._loadVideo(file);
      } else {
        mediaElement = await this._loadImage(file);
      }

      // Show preview
      this.display.showPreview(file, mediaElement);

      // Run analysis
      const results = await this.pipeline.run(file, mediaElement, (step, detail) => {
        this.display.updateLoadingStep(detail);
      });

      // Display results
      this.display.hideLoading();
      this.display.showResults(results);

    } catch (err) {
      this.display.hideLoading();
      this._showError(`Analysis failed: ${err.message}. Please try a different file.`);
      console.error('Analysis error:', err);
    }
  }

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image. File may be corrupted.'));
      img.src = URL.createObjectURL(file);
    });
  }

  _loadVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error('Could not load video. File may be corrupted.'));
      video.src = URL.createObjectURL(file);
    });
  }

  _showError(message) {
    // Temporary error display
    const existing = document.querySelector('.error-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.style.cssText = `
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      color: #ef4444;
      font-size: 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const icon = document.createElement('span');
    icon.textContent = '⚠️ ' + message;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss error');
    closeBtn.style.cssText = 'background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.2rem;padding:0';
    closeBtn.addEventListener('click', () => banner.remove());
    banner.appendChild(icon);
    banner.appendChild(closeBtn);

    banner.setAttribute('role', 'alert');
    const main = document.querySelector('.main');
    main.insertBefore(banner, main.firstChild);

    // Auto-remove after 8 seconds
    setTimeout(() => banner.remove(), 8000);
  }

  _extractFilenameFromUrl(url, contentType) {
    try {
      const pathname = new URL(url).pathname;
      const basename = pathname.split('/').pop();
      if (basename && basename.includes('.')) return basename;
    } catch { /* fall through */ }

    // Generate from content type
    const ext = contentType.includes('png') ? '.png' :
                contentType.includes('webp') ? '.webp' :
                contentType.includes('gif') ? '.gif' :
                contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg' :
                contentType.includes('bmp') ? '.bmp' :
                contentType.includes('mp4') ? '.mp4' :
                contentType.includes('webm') ? '.webm' : '.bin';
    return `fetched-image${ext}`;
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
