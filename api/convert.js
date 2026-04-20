import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

const CHROMIUM_PACK =
  'https://github.com/Sparticuz/chromium/releases/download/v147.0.1/chromium-v147.0.1-pack.x64.tar';

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
  maxDuration: 60,
};

let cachedExecutablePath;

async function getExecutablePath() {
  if (cachedExecutablePath) return cachedExecutablePath;
  cachedExecutablePath = await chromium.executablePath(CHROMIUM_PACK);
  return cachedExecutablePath;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    html,
    format = 'A4',
    landscape = false,
    margin = '0',
    filename = 'document.pdf',
  } = req.body ?? {};

  if (!html || typeof html !== 'string' || html.length < 20) {
    return res.status(400).json({ error: 'HTML fehlt oder ist zu kurz.' });
  }
  if (html.length > 5_000_000) {
    return res.status(413).json({ error: 'HTML zu groß (max. 5 MB).' });
  }

  let browser;
  try {
    const isLocal = !process.env.AWS_LAMBDA_FUNCTION_VERSION && !process.env.VERCEL;

    browser = await puppeteer.launch({
      args: isLocal
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : chromium.args,
      executablePath: isLocal
        ? process.env.PUPPETEER_EXECUTABLE_PATH ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : await getExecutablePath(),
      headless: true,
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 30_000 });
    await page.evaluateHandle('document.fonts.ready');

    const marginStr = /\D/.test(String(margin)) ? String(margin) : `${margin}mm`;

    const pdf = await page.pdf({
      format,
      landscape: Boolean(landscape),
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: marginStr,
        right: marginStr,
        bottom: marginStr,
        left: marginStr,
      },
    });

    const safeName = String(filename).replace(/[^\w.\-]/g, '_').slice(0, 80) || 'document.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', pdf.length);
    res.status(200).send(pdf);
  } catch (error) {
    console.error('PDF conversion failed:', error);
    res.status(500).json({ error: error.message ?? 'Unbekannter Fehler.' });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
