import puppeteer from 'puppeteer';

export async function htmlToPdf({
  html,
  baseUrl,
  outputPath,
  format = 'A4',
  landscape = false,
  margin = '0',
  printBackground = true,
  scale = 1,
  headerTemplate,
  footerTemplate,
}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });

    await page.goto(baseUrl ?? 'about:blank');
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });

    await page.evaluateHandle('document.fonts.ready');

    const mm = typeof margin === 'string' ? margin : `${margin}mm`;
    const hasTemplate = Boolean(headerTemplate || footerTemplate);

    await page.pdf({
      path: outputPath,
      format,
      landscape,
      printBackground,
      scale,
      preferCSSPageSize: true,
      displayHeaderFooter: hasTemplate,
      headerTemplate: headerTemplate ?? '<span></span>',
      footerTemplate:
        footerTemplate ??
        `<div style="width:100%;font-size:9px;color:#94a3b8;text-align:center;padding:0 12mm;">
           <span class="pageNumber"></span> / <span class="totalPages"></span>
         </div>`,
      margin: { top: mm, right: mm, bottom: mm, left: mm },
    });
  } finally {
    await browser.close();
  }
}
