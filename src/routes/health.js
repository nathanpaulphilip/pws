'use strict';

const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/info', (_req, res) => {
  res.json({
    name: 'Freebuff Desktop',
    version: '1.0.0',
    description: 'AI Media Authenticity Analyzer',
    maxUploadSizeMB: config.upload.maxFileSizeMB,
    allowedTypes: config.upload.allowedMimeTypes,
    privacy: 'All analysis runs in your browser. No media data is stored on the server beyond temporary processing.',
  });
});

module.exports = router;
