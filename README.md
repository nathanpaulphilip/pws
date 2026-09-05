# Freebuff Desktop — AI Media Authenticity Analyzer

A privacy-first, client-side analysis tool that detects potential manipulation and AI generation in images and videos. **All analysis runs entirely in your browser** — no media data is sent to any server.

## Features

- **Error Level Analysis (ELA)** — reveals compression inconsistencies from splicing/editing
- **Metadata Analysis** — validates EXIF data for AI generation markers, editing software, and anomalies
- **Pixel-Level Analysis** — detects noise pattern inconsistencies, color distribution anomalies, and edge artifacts
- **Frequency Domain Analysis** — identifies JPEG grid inconsistencies and AI-typical frequency signatures
- **URL Fetching** — analyze images directly from URLs with SSRF protection
- **Privacy-First** — zero server-side processing; all computation happens in the browser

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `production` enables HSTS and caching |
| `MAX_FILE_SIZE_MB` | `10` | Maximum upload size in MB |
| `RATE_LIMIT_WINDOW_MS` | `600000` | Rate limit window (10 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `20` | Max requests per window |
| `CORS_ORIGINS` | *(empty)* | Comma-separated allowed origins |

## Architecture

```
freebuff-desktop/
├── src/                     # Server code
│   ├── server.js            # Express entry point
│   ├── config.js            # Centralized configuration
│   ├── middleware/
│   │   ├── security.js      # Helmet, CORS, rate limiting
│   │   ├── validation.js    # File type/magic-byte validation
│   │   └── errorHandler.js  # Safe error responses
│   ├── routes/
│   │   ├── upload.js        # File upload and serving
│   │   └── health.js        # Health and info endpoints
│   └── utils/
│       ├── ssrf.js          # SSRF protection for URLs
│       ├── sanitizer.js     # Input/filename sanitization
│       └── cleanup.js       # Temporary file cleanup
├── client/                  # Frontend (vanilla JS)
│   ├── index.html           # Main page
│   ├── css/style.css        # Styles
│   └── js/
│       ├── app.js           # Application entry point
│       └── modules/
│           ├── analysis.js  # Analysis pipeline orchestrator
│           ├── ela.js       # Error Level Analysis
│           ├── metadata.js  # EXIF metadata parsing
│           ├── pixel.js     # Pixel-level analysis
│           ├── frequency.js # Frequency domain analysis
│           └── display.js   # UI rendering
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## How Analysis Works

1. **Upload** an image (JPEG, PNG, WebP, GIF, BMP, TIFF) or video (MP4, WebM, MOV)
2. **Metadata** is extracted and validated for editing software, AI markers, and anomalies
3. **ELA** re-saves the image at a known quality and computes pixel differences
4. **Pixel analysis** examines noise patterns, color distributions, and edge transitions
5. **Frequency analysis** checks for JPEG grid inconsistencies and AI-generation signatures
6. **Results** are displayed with confidence levels, evidence cards, and recommended actions

## Security

- **File validation**: Extension, MIME type, and magic-byte verification
- **SSRF protection**: Blocks requests to private IPs and localhost
- **Rate limiting**: Configurable request throttling
- **CSP headers**: Strict Content Security Policy via Helmet
- **Input sanitization**: XSS prevention and path traversal protection
- **Error handling**: No internal details leaked to clients
- **Temporary storage**: Files auto-deleted after serving or after TTL

## Testing

```bash
# Run all tests
npm test

# Verbose output
npm run test:verbose
```

## Deployment

### Production

```bash
NODE_ENV=production npm start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### Environment

Ensure `uploads/` directory is writable and set appropriate `MAX_FILE_SIZE_MB` and rate limits for production traffic.

## Limitations

- This tool performs **heuristic analysis**, not definitive authentication
- Results are **probabilistic** — false positives and negatives are possible
- Low-quality or heavily compressed media reduces accuracy
- Sophisticated manipulation may not be detectable
- Video analysis is limited compared to image analysis
- For high-stakes verification, use professional forensic tools and domain experts

## License

MIT
