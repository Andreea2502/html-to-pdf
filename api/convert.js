import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';
import { marked } from 'marked';
import { PDFDocument } from '@cantoo/pdf-lib';

const CHROMIUM_PACK =
  'https://github.com/Sparticuz/chromium/releases/download/v147.0.1/chromium-v147.0.1-pack.x64.tar';

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 60,
};

let cachedExecutablePath;
async function getExecutablePath() {
  if (cachedExecutablePath) return cachedExecutablePath;
  cachedExecutablePath = await chromium.executablePath(CHROMIUM_PACK);
  return cachedExecutablePath;
}

// ───────────────────────── INPUT PROCESSING ─────────────────────────

async function fetchUrl(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('Nur http(s) URLs erlaubt.');
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`URL ${url} antwortete mit ${res.status}.`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('html') && !ct.includes('xml')) {
    throw new Error(`URL liefert kein HTML (Content-Type: ${ct}).`);
  }
  let html = await res.text();
  const base = `${u.origin}${u.pathname.replace(/\/[^/]*$/, '/')}`;
  if (!/<base\s/i.test(html)) {
    html = html.replace(
      /<head[^>]*>/i,
      (m) => `${m}<base href="${escapeHtml(base)}">`
    );
  }
  return html;
}

function markdownToHtml(md) {
  marked.setOptions({ gfm: true, breaks: false, pedantic: false });
  const body = marked.parse(md);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --paper:#FAF8F3; --ink:#11162A; --muted:#5A6070; --rule:#E7E1D4; --accent:#E8552B; }
  html, body { margin:0; padding:0; background:var(--paper); color:var(--ink); }
  body { font-family:'Inter',sans-serif; font-size:11pt; line-height:1.65; padding:20mm 22mm; max-width:none; -webkit-font-smoothing:antialiased; }
  h1, h2, h3, h4 { font-family:'Fraunces',serif; line-height:1.2; font-weight:700; letter-spacing:-0.01em; }
  h1 { font-size:32pt; margin:0 0 8mm; }
  h1 + p { font-size:13pt; color:#242A40; }
  h2 { font-size:20pt; margin:10mm 0 4mm; padding-bottom:2mm; border-bottom:1px solid var(--rule); }
  h3 { font-size:14pt; margin:6mm 0 2mm; }
  h4 { font-size:11pt; margin:4mm 0 1mm; font-family:'Inter',sans-serif; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); }
  p { margin:0 0 4mm; }
  a { color:var(--accent); text-decoration-color:rgba(232,85,43,0.4); }
  strong { font-weight:600; }
  em { font-style:italic; }
  code { font-family:'JetBrains Mono',monospace; background:#F1ECDF; padding:1px 5px; border-radius:3px; font-size:0.9em; }
  pre { background:var(--ink); color:#F6F2E7; padding:5mm; border-radius:6px; overflow:auto; font-size:9.5pt; line-height:1.55; }
  pre code { background:transparent; color:inherit; padding:0; }
  blockquote { border-left:3px solid var(--accent); margin:5mm 0; padding:2mm 5mm; font-family:'Fraunces',serif; font-size:13pt; line-height:1.5; color:#1A2036; font-style:italic; }
  table { border-collapse:collapse; width:100%; margin:5mm 0; }
  th, td { border-bottom:1px solid var(--rule); padding:2.5mm 3mm; text-align:left; vertical-align:top; }
  th { background:#F1ECDF; font-weight:600; font-size:10pt; }
  ul, ol { padding-left:6mm; margin:0 0 4mm; }
  li { margin-bottom:1.5mm; }
  img { max-width:100%; height:auto; border-radius:4px; }
  hr { border:none; border-top:1px solid var(--rule); margin:8mm 0; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function combineHtmls(htmls) {
  const list = htmls.filter((h) => h && h.trim());
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  const bodies = list.map((h) => {
    const m = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : h;
  });
  const headMatch = list[0].match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '<head><meta charset="utf-8"></head>';
  const sep =
    '<div style="page-break-before:always;break-before:page;height:0"></div>';
  return `<!doctype html><html>${head}<body>${bodies.join(sep)}</body></html>`;
}

// ───────────────────────── PAGE PREPARATION ─────────────────────────

async function prepareForPdf(page, opts) {
  const {
    expandAll,
    forceVisible,
    highlightLinks,
    overridePageMargin,
    customCss,
    darkMode,
    watermark,
    autoToc,
    logo,
    logoPosition,
    logoWidth,
  } = opts;

  await page.evaluate(
    (args) => {
      const {
        expandAll,
        forceVisible,
        highlightLinks,
        overridePageMargin,
        customCss,
        darkMode,
        watermark,
      } = args;
      const injectStyle = (css) => {
        const s = document.createElement('style');
        s.setAttribute('data-pdf-prep', '');
        s.textContent = css;
        document.head.appendChild(s);
      };

      if (overridePageMargin) {
        injectStyle(`@page { margin: ${overridePageMargin} !important; }`);
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            for (let i = rules.length - 1; i >= 0; i--) {
              if (rules[i].type === 6 /* CSSRule.PAGE_RULE */) sheet.deleteRule(i);
            }
          } catch (e) { /* CORS */ }
        }
      }

      // Page-break protection (always on)
      injectStyle(`
        @media print, screen {
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid !important; break-after: avoid !important;
            page-break-inside: avoid !important; break-inside: avoid !important;
          }
          figure, picture, table, blockquote, pre, dl, details,
          .card, [class~="card"], [class*="-card"],
          .box:not(body), [class~="box"]:not(body),
          .tile, [class~="tile"], .panel, [class~="panel"],
          .alert, .callout, .quote, .frame,
          .station, .module, .feature, .item, .entry,
          li, .list-item {
            page-break-inside: avoid !important; break-inside: avoid !important;
          }
          p { orphans: 3 !important; widows: 3 !important; }
          img, svg, video {
            page-break-inside: avoid !important; break-inside: avoid !important;
            max-width: 100% !important;
          }
        }
      `);

      if (forceVisible) {
        injectStyle(`
          *, *::before, *::after {
            animation-duration: 0s !important; animation-delay: 0s !important;
            transition-duration: 0s !important; transition-delay: 0s !important;
          }
          [data-aos], .aos-init, .aos-animate, .wow, .reveal, .animate-on-scroll,
          [class*="fade-"], [class*="slide-"], [class*="zoom-"] {
            opacity: 1 !important; transform: none !important; visibility: visible !important;
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
            display: block !important; max-height: none !important; height: auto !important;
            visibility: visible !important; opacity: 1 !important;
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
          if (!targetSel || targetSel === '#' || targetSel.length < 2) return;
          const sel = targetSel.startsWith('#') ? targetSel : '#' + targetSel;
          // Selector must be a valid CSS identifier after #
          if (!/^#[\w-]+$/.test(sel)) return;
          let t;
          try { t = document.querySelector(sel); } catch { return; }
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

      if (darkMode) {
        injectStyle(`
          html, body { background: #0B0F19 !important; color: #E6E1D2 !important; }
          *, *::before, *::after { background-color: transparent !important; border-color: #2A3050 !important; color: #E6E1D2 !important; }
          h1, h2, h3, h4, h5, h6 { color: #FFF6E6 !important; }
          a, a * { color: #F4C95D !important; }
          strong, b { color: #FFF6E6 !important; }
          em, i { color: #E6E1D2 !important; }
          code, pre { background: #1B2238 !important; color: #F4C95D !important; }
          blockquote { border-left-color: #E8552B !important; }
          hr { border-color: #2A3050 !important; }
          table th { background: #1B2238 !important; }
          table th, table td { border-color: #2A3050 !important; }
          input, textarea, select, button { background: #1B2238 !important; color: #E6E1D2 !important; }
          /* keep media as-is */
          img, video, svg, picture, canvas { background: transparent !important; opacity: 0.95; }
          /* override backgrounds set via inline style */
          [style*="background:#fff"], [style*="background: #fff"],
          [style*="background:white"], [style*="background: white"] { background: #11162A !important; }
        `);
      }

      if (watermark) {
        const wm = String(watermark).slice(0, 60);
        const safe = wm.replace(/"/g, '\\"').replace(/\n/g, ' ');
        injectStyle(`
          body::before {
            content: "${safe}" !important;
            position: fixed !important;
            top: 50% !important; left: 50% !important;
            transform: translate(-50%, -50%) rotate(-30deg) !important;
            font-family: 'Inter', sans-serif !important;
            font-size: ${Math.max(60, 720 / Math.max(wm.length, 4))}pt !important;
            font-weight: 700 !important;
            color: rgba(232, 85, 43, 0.10) !important;
            z-index: 99999 !important;
            pointer-events: none !important;
            white-space: nowrap !important;
            text-transform: uppercase !important;
            letter-spacing: 0.08em !important;
          }
        `);
      }

      if (customCss) injectStyle(customCss);

      // Logo — repeating brand mark on every page via position:fixed
      if (args.logo) {
        const pos = args.logoPosition || 'top-right';
        const w = Math.max(10, Math.min(80, Number(args.logoWidth) || 30));
        const placements = {
          'top-right':    'top:8mm; right:10mm;',
          'top-left':     'top:8mm; left:10mm;',
          'top-center':   'top:8mm; left:50%; transform:translateX(-50%);',
          'bottom-right': 'bottom:8mm; right:10mm;',
          'bottom-left':  'bottom:8mm; left:10mm;',
        };
        const placement = placements[pos] || placements['top-right'];
        const align = pos.includes('right') ? 'flex-end'
                    : pos.includes('left')  ? 'flex-start'
                    : 'center';
        const div = document.createElement('div');
        div.setAttribute('data-pdf-logo', '');
        div.style.cssText = `position:fixed;${placement}width:${w}mm;height:18mm;z-index:99998;pointer-events:none;display:flex;align-items:center;justify-content:${align};`;
        const img = document.createElement('img');
        img.src = args.logo;
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
        div.appendChild(img);
        document.body.appendChild(div);
      }
    },
    {
      expandAll,
      forceVisible,
      highlightLinks,
      overridePageMargin,
      customCss,
      darkMode,
      watermark,
      logo,
      logoPosition,
      logoWidth,
    }
  );

  // Auto-TOC needs a separate pass after headings are stable
  if (autoToc) {
    const items = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('h1, h2'));
      return heads.map((h, i) => {
        if (!h.id) h.id = `toc-${i}`;
        return { level: h.tagName, text: h.textContent.trim().slice(0, 200), id: h.id };
      });
    });
    if (items.length >= 2) {
      const tocHtml = renderToc(items);
      await page.evaluate((tocHtml) => {
        document.body.insertAdjacentHTML('afterbegin', tocHtml);
      }, tocHtml);
    }
  }

  // Trigger lazy-loading
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluateHandle('document.fonts.ready');
}

function renderToc(items) {
  const li = items
    .map(
      (it) => `<li style="padding:5px 0;border-bottom:1px dashed #E7E1D4;font-size:${
        it.level === 'H1' ? '14pt' : '11pt'
      };margin-left:${it.level === 'H1' ? '0' : '12mm'};color:#11162A;list-style:none">
        <a href="#${it.id}" style="color:inherit;text-decoration:none">${escapeHtml(it.text)}</a>
      </li>`
    )
    .join('');
  return `<section style="page-break-after:always;break-after:page;padding:30mm 25mm;font-family:'Inter',sans-serif;background:#FAF8F3;color:#11162A">
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5A6070;margin-bottom:8mm;font-weight:600">Inhaltsverzeichnis</div>
    <h1 style="font-family:'Fraunces',serif;font-size:42pt;line-height:1.05;margin:0 0 14mm;font-weight:700;letter-spacing:-0.01em">Inhalt.</h1>
    <ol style="list-style:none;padding:0;margin:0">${li}</ol>
  </section>`;
}

// ───────────────────────── HANDLER ─────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let {
    html,
    htmls,
    markdown,
    url,
    inputType = 'html',
    format = 'A4',
    landscape = false,
    margin = 'auto',
    filename = 'document.pdf',
    expandAll = true,
    forceVisible = true,
    highlightLinks = false,
    header = '',
    footer = '',
    pageNumbers = false,
    scale = 1,
    output = 'pdf', // pdf | png | jpg
    customCss = '',
    darkMode = false,
    watermark = '',
    autoToc = false,
    password = '',
    logo = '',
    logoPosition = 'top-right',
    logoWidth = 30,
    addCover = false,
    coverTitle = '',
    coverSubtitle = '',
    coverAuthor = '',
    coverDate = '',
    coverDescription = '',
  } = req.body ?? {};

  const safeScale = Math.min(1.3, Math.max(0.1, Number(scale) || 1));
  const outputType = ['pdf', 'png', 'jpg'].includes(output) ? output : 'pdf';

  let browser;
  try {
    // Resolve input source → final HTML (or defer to page.goto for URLs)
    let navigateToUrl = null;
    if (inputType === 'url' || (url && !html && !markdown && !htmls)) {
      if (!url) return res.status(400).json({ error: 'URL fehlt.' });
      try {
        const u = new URL(url);
        if (!['http:', 'https:'].includes(u.protocol)) {
          return res.status(400).json({ error: 'Nur http(s) URLs erlaubt.' });
        }
        navigateToUrl = url;
      } catch {
        return res.status(400).json({ error: 'URL ungültig.' });
      }
      html = '<!-- placeholder -->';  // pass length check; actual content comes from goto
    } else if (inputType === 'markdown' || (markdown && !html && !htmls)) {
      if (!markdown || markdown.trim().length < 3) {
        return res.status(400).json({ error: 'Markdown fehlt.' });
      }
      html = markdownToHtml(markdown);
    } else if (inputType === 'multi' || (Array.isArray(htmls) && htmls.length > 0)) {
      if (!Array.isArray(htmls) || htmls.length === 0) {
        return res.status(400).json({ error: 'Keine Snippets übergeben.' });
      }
      html = combineHtmls(htmls);
    }

    if (!navigateToUrl) {
      if (!html || typeof html !== 'string' || html.length < 20) {
        return res.status(400).json({ error: 'Eingabe fehlt oder ist zu kurz.' });
      }
      if (html.length > 5_000_000) {
        return res.status(413).json({ error: 'Eingabe zu groß (max. 5 MB).' });
      }
    }

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

    // Margin resolution
    let marginStr, marginValue, userWantsMargin;
    if (String(margin) === 'auto') {
      const hasPageMarginRule = /@page[^{]*\{[^}]*margin\s*:/i.test(html);
      if (hasPageMarginRule) {
        marginStr = '0mm'; marginValue = 0; userWantsMargin = false;
      } else {
        marginStr = '12mm'; marginValue = 12; userWantsMargin = true;
      }
    } else {
      marginStr = /\D/.test(String(margin)) ? String(margin) : `${margin}mm`;
      marginValue = parseFloat(String(margin)) || 0;
      userWantsMargin = marginValue > 0;
    }

    const hasHeader = Boolean(header && header.trim());
    const hasFooter = Boolean((footer && footer.trim()) || pageNumbers);
    const userWantsCustomScale = safeScale !== 1;
    const useExplicitLayout =
      userWantsMargin || hasHeader || hasFooter || userWantsCustomScale;
    const effectiveMargin =
      hasHeader || hasFooter ? '18mm' : userWantsMargin ? marginStr : null;

    const page = await browser.newPage();

    // Identify as real Chrome so sites don't block "HeadlessChrome"
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    // Force light color scheme so sites that auto-dark don't render a black page
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);

    if (navigateToUrl) {
      await page.goto(navigateToUrl, { waitUntil: ['load', 'networkidle2'], timeout: 30_000 });
      // Give lazy content a moment after navigation
      await new Promise((r) => setTimeout(r, 600));
    } else {
      await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 30_000 });
    }

    await prepareForPdf(page, {
      expandAll,
      forceVisible,
      highlightLinks,
      overridePageMargin: effectiveMargin,
      customCss,
      darkMode,
      watermark,
      autoToc,
      logo,
      logoPosition,
      logoWidth,
    });

    // Prepend cover page (after preparation so it isn't affected by expand/dark-mode tweaks
    // meant for the user's main content)
    if (addCover && coverTitle && coverTitle.trim()) {
      const coverHtml = renderCoverPage({
        title: coverTitle.trim(),
        subtitle: (coverSubtitle || '').trim(),
        author: (coverAuthor || '').trim(),
        date: (coverDate || '').trim(),
        description: (coverDescription || '').trim(),
      });
      await page.evaluate((h) => {
        document.body.insertAdjacentHTML('afterbegin', h);
      }, coverHtml);
    }

    // Apply zoom via CSS so layout reflows (more content per row)
    // instead of Puppeteer's scale which keeps layout fixed and adds margins.
    if (safeScale !== 1) {
      await page.evaluate((z) => {
        document.documentElement.style.zoom = z;
      }, safeScale);
      await new Promise((r) => setTimeout(r, 150));
    }

    const safeName =
      String(filename).replace(/[^\w.\-]/g, '_').slice(0, 80) || 'document';

    // ─── Image output ──────────────────────────────────────────
    if (outputType === 'png' || outputType === 'jpg') {
      const buffer = await page.screenshot({
        fullPage: true,
        type: outputType === 'jpg' ? 'jpeg' : 'png',
        quality: outputType === 'jpg' ? 92 : undefined,
        omitBackground: false,
      });
      const ext = outputType === 'jpg' ? 'jpg' : 'png';
      const name = safeName.endsWith(`.${ext}`) ? safeName : `${safeName.replace(/\.\w+$/, '')}.${ext}`;
      res.setHeader('Content-Type', `image/${outputType === 'jpg' ? 'jpeg' : 'png'}`);
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).end(Buffer.from(buffer));
    }

    // ─── PDF output ────────────────────────────────────────────
    const wrap = (content) =>
      `<div style="width:100%;font-family:Inter,system-ui,sans-serif;font-size:9px;color:#5A6070;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;">${content}</div>`;

    const headerTemplate = hasHeader
      ? wrap(`<span>${escapeHtml(header)}</span><span></span>`)
      : '<span></span>';
    const footerParts = [];
    footerParts.push(footer && footer.trim() ? `<span>${escapeHtml(footer)}</span>` : '<span></span>');
    footerParts.push(
      pageNumbers
        ? `<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>`
        : '<span></span>'
    );
    const footerTemplate = hasFooter ? wrap(footerParts.join('')) : '<span></span>';

    const headerFooterMargin =
      hasHeader || hasFooter
        ? { top: '18mm', bottom: '18mm' }
        : { top: marginStr, bottom: marginStr };

    let pdf = await page.pdf({
      format,
      landscape: Boolean(landscape),
      printBackground: true,
      preferCSSPageSize: !useExplicitLayout,
      displayHeaderFooter: hasHeader || hasFooter,
      outline: true,
      tagged: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: headerFooterMargin.top,
        right: marginStr,
        bottom: headerFooterMargin.bottom,
        left: marginStr,
      },
    });

    // Optional encryption
    if (password && String(password).trim().length > 0) {
      pdf = await encryptPdf(pdf, String(password).trim());
    }

    const pdfBuffer = Buffer.from(pdf);
    const name = safeName.endsWith('.pdf') ? safeName : `${safeName.replace(/\.\w+$/, '')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).end(pdfBuffer);
  } catch (error) {
    console.error('Conversion failed:', error);
    return res.status(500).json({ error: error.message ?? 'Unbekannter Fehler.' });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

async function encryptPdf(pdfBytes, password) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  await pdfDoc.encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });
  return await pdfDoc.save({ useObjectStreams: false });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCoverPage({ title, subtitle, author, date, description }) {
  const esc = escapeHtml;
  return `
<section data-cover style="width:100%;height:267mm;padding:45mm 30mm 35mm;page-break-after:always;break-after:page;background:#FAF8F3;color:#11162A;font-family:'Inter',system-ui,sans-serif;display:flex;flex-direction:column;box-sizing:border-box;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased">
  <div style="position:absolute;top:0;left:0;right:0;height:6px;background:#E8552B"></div>
  <div style="flex-shrink:0">
    <div style="display:inline-flex;align-items:center;gap:10px;background:#F1ECDF;padding:5px 14px;border-radius:999px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#11162A;font-weight:600;margin-bottom:12mm">
      <span style="width:8px;height:8px;background:#E8552B;border-radius:50%;display:inline-block"></span>
      <span>Dokument</span>
    </div>
    ${author ? `<div style="font-size:11pt;letter-spacing:0.22em;text-transform:uppercase;color:#5A6070;font-weight:600">${esc(author)}</div>` : ''}
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:15mm 0;min-height:0">
    <h1 style="font-family:'Fraunces',Georgia,serif;font-size:64pt;line-height:1.02;letter-spacing:-0.015em;margin:0 0 10mm;font-weight:700;word-break:break-word">${esc(title)}</h1>
    ${subtitle ? `<p style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:20pt;line-height:1.35;color:#5A6070;margin:0;font-weight:400">${esc(subtitle)}</p>` : ''}
    ${description ? `<p style="font-family:'Inter',sans-serif;font-size:13pt;line-height:1.55;color:#242A40;margin:14mm 0 0;max-width:140mm">${esc(description)}</p>` : ''}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:end;font-size:10pt;color:#5A6070;letter-spacing:0.2em;text-transform:uppercase;padding-top:10mm;border-top:1px solid #E7E1D4;flex-shrink:0">
    <span>${esc(date || '')}</span>
    <span style="color:#E8552B;font-family:'Fraunces',serif;font-size:16pt;letter-spacing:0">◆</span>
  </div>
</section>`;
}
