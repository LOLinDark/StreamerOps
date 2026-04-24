import { createLogger } from '../../lib/logger.js';

const logger = createLogger('api.images');
const CLIPDROP_REMOVE_BG_URL = 'https://clipdrop-api.co/remove-background/v1';
const MAX_UPLOAD_BYTES = 31 * 1024 * 1024;

function readClipdropApiKey(req) {
  const headerKey = req.headers['x-clipdrop-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const envKey = process.env.CLIPDROP_API_KEY;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }

  return '';
}

export function registerImageRoutes(app) {
  app.post('/api/images/remove-background/clipdrop', async (req, res) => {
    try {
      const apiKey = readClipdropApiKey(req);
      if (!apiKey) {
        return res.status(400).json({ error: 'Missing Clipdrop API key' });
      }

      const contentType = String(req.headers['content-type'] || '');
      if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return res.status(415).json({ error: 'Content-Type must be multipart/form-data' });
      }

      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: 'Upload too large. Maximum 31MB.' });
      }

      const upstream = await fetch(CLIPDROP_REMOVE_BG_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          accept: 'image/png',
          'content-type': contentType,
        },
        body: req,
        duplex: 'half',
      });

      const upstreamType = upstream.headers.get('content-type') || '';
      const remainingCredits = upstream.headers.get('x-remaining-credits');
      const consumedCredits = upstream.headers.get('x-credits-consumed');

      if (!upstream.ok) {
        const errorText = await upstream.text().catch(() => '');
        logger.warn(`Clipdrop remove-background failed: ${upstream.status} ${errorText.slice(0, 200)}`);
        return res.status(upstream.status).json({
          error: `Clipdrop API error (${upstream.status})`,
          details: errorText || undefined,
        });
      }

      const imageBuffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstreamType || 'image/png');
      if (remainingCredits) res.setHeader('x-clipdrop-remaining-credits', remainingCredits);
      if (consumedCredits) res.setHeader('x-clipdrop-credits-consumed', consumedCredits);
      return res.status(200).send(imageBuffer);
    } catch (error) {
      logger.error(`Clipdrop proxy route failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to remove image background' });
    }
  });

  logger.info('Image routes registered');
}
