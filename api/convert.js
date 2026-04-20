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

async function prepareForPdf(page, { expandAll, forceVisible, highlightLinks }) {
  await page.evaluate(
    ({ expandAll, forceVisible, highlightLinks }) => {
      const injectStyle = (css) => {
        const s = document.createElement('style');
        s.setAttribute('data-pdf-prep', '');
        s.textContent = css;
        document.head.appendChild(s);
      };

      if (forceVisible) {
        injectStyle(`
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
          [data-aos], .aos-init, .aos-animate, .wow, .reveal, .animate-on-scroll,
          [class*="fade-"], [class*="slide-"], [class*="zoom-"] {
            opacity: 1 !important;
            transform: none !important;
            visibility: visible !important;
            animation-name: none !important;
          }
          [style*="opacity: 0"], [style*="opacity:0"] { opacity: 1 !important; }
          [x-cloak] { display: revert !important; }
        `);

        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          const op = parseFloat(cs.opacity);
          if (!isNaN(op) && op < 1) el.style.setProperty('opacity', '1', 'important');
          if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
        });
      }

      if (expandAll) {
        injectStyle(`
          details { overflow: visible !important; }
          details > summary ~ * { display: revert !important; }
          .collapse, .collapsible, .accordion-collapse, .accordion-body,
          .tw-hidden, .is-collapsed, [data-collapsed="true"] {
            display: block !important;
            max-height: none !important;
            height: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          [aria-hidden="true"]:not(svg) { display: revert !important; }
        `);

        document.querySelectorAll('details').forEach((d) => (d.open = true));
        document.querySelectorAll('[hidden]').forEach((el) => el.removeAttribute('hidden'));
        document.querySelectorAll('[aria-expanded="false"]').forEach((el) => {
          el.setAttribute('aria-expanded', 'true');
          const targetSel =
            el.getAttribute('aria-controls') ||
            el.getAttribute('data-target') ||
            el.getAttribute('data-bs-target') ||
            el.getAttribute('href');
          if (!targetSel) return;
          const sel = targetSel.startsWith('#') ? targetSel : '#' + targetSel;
          const t = document.querySelector(sel);
          if (t) {
            t.classList.add('show', 'expanded', 'open', 'active', 'in');
            t.classList.remove('collapse', 'collapsed', 'hidden', 'is-collapsed');
            t.style.setProperty('display', 'block', 'important');
            t.style.setProperty('max-height', 'none', 'important');
            t.style.setProperty('height', 'auto', 'important');
            t.removeAttribute('hidden');
          }
        });

        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.maxHeight && cs.maxHeight !== 'none' && parseFloat(cs.maxHeight) === 0) {
            el.style.setProperty('max-height', 'none', 'important');
          }
          if (cs.overflow === 'hidden' && parseFloat(cs.height) === 0) {
            el.style.setProperty('height', 'auto', 'important');
          }
        });
      }

      if (highlightLinks) {
        injectStyle(`
          a[href]:not([href^="#"]):not([href^="javascript:"]) {
            text-decoration: underline !important;
            text-underline-offset: 2px !important;
            color: #E8552B !important;
          }
        `);
      }

      // Trigger lazy-loading: scroll to bottom then back up so IntersectionObserver fires
      window.scrollTo(0, document.body.scrollHeight);
      window.scrollTo(0, 0);
    },
    { expandAll, forceVisible, highlightLinks }
  );

  // Give lazy-loaded content a beat
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluateHandle('document.fonts.ready');
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
    expandAll = true,
    forceVisible = true,
    highlightLinks = false,
    header = '',
    footer = '',
    pageNumbers = false,
    scale = 1,
  } = req.body ?? {};

  const safeScale = Math.min(2, Math.max(0.5, Number(scale) || 1));

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

    await prepareForPdf(page, { expandAll, forceVisible, highlightLinks });

    const marginStr = /\D/.test(String(margin)) ? String(margin) : `${margin}mm`;
    const marginValue = parseFloat(String(margin)) || 0;
    const hasHeader = Boolean(header && header.trim());
    const hasFooter = Boolean((footer && footer.trim()) || pageNumbers);
    const userWantsMargin = marginValue > 0;
    const userWantsCustomScale = safeScale !== 1;
    // Only let the source HTML's @page rules win if user hasn't customized anything.
    // Otherwise our format/margin/scale settings must override CSS @page.
    const useExplicitLayout = userWantsMargin || hasHeader || hasFooter || userWantsCustomScale;

    const wrap = (content) =>
      `<div style="width:100%;font-family:Inter,system-ui,sans-serif;font-size:9px;color:#5A6070;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;">${content}</div>`;

    const headerTemplate = hasHeader
      ? wrap(`<span>${escapeHtml(header)}</span><span></span>`)
      : '<span></span>';

    const footerParts = [];
    if (footer && footer.trim()) footerParts.push(`<span>${escapeHtml(footer)}</span>`);
    else footerParts.push('<span></span>');
    if (pageNumbers)
      footerParts.push(
        `<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>`
      );
    else footerParts.push('<span></span>');

    const footerTemplate = hasFooter ? wrap(footerParts.join('')) : '<span></span>';

    // Headers/footers need non-zero margin to be visible
    const headerFooterMargin =
      hasHeader || hasFooter
        ? { top: '18mm', bottom: '18mm' }
        : { top: marginStr, bottom: marginStr };

    const pdf = await page.pdf({
      format,
      landscape: Boolean(landscape),
      printBackground: true,
      scale: safeScale,
      preferCSSPageSize: !useExplicitLayout,
      displayHeaderFooter: hasHeader || hasFooter,
      headerTemplate,
      footerTemplate,
      margin: {
        top: headerFooterMargin.top,
        right: marginStr,
        bottom: headerFooterMargin.bottom,
        left: marginStr,
      },
    });

    const safeName = String(filename).replace(/[^\w.\-]/g, '_').slice(0, 80) || 'document.pdf';
    const pdfBuffer = Buffer.from(pdf);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (error) {
    console.error('PDF conversion failed:', error);
    res.status(500).json({ error: error.message ?? 'Unbekannter Fehler.' });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
