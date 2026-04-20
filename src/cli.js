#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Handlebars from 'handlebars';
import { htmlToPdf } from './converter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('html2pdf')
  .description('Wandelt HTML in ein designtes PDF um.')
  .requiredOption('-i, --input <path>', 'HTML- oder Handlebars-Template-Datei')
  .option('-o, --output <path>', 'Ziel-PDF', 'out/output.pdf')
  .option('-d, --data <path>', 'JSON-Daten für Handlebars-Template')
  .option('-f, --format <size>', 'Papierformat (A4, Letter, …)', 'A4')
  .option('--landscape', 'Querformat', false)
  .option('--margin <mm>', 'Seitenrand in mm', '0')
  .option('--header <html>', 'HTML-Header-Template (optional)')
  .option('--footer <html>', 'HTML-Footer-Template (optional)')
  .option('--no-print-bg', 'Hintergrund-Farben/-Bilder nicht drucken')
  .option('--scale <n>', 'Skalierung (0.1–2)', '1');

program.parse();
const opts = program.opts();

const inputPath = resolve(process.cwd(), opts.input);
const outputPath = resolve(process.cwd(), opts.output);

if (!existsSync(inputPath)) {
  console.error(`Input nicht gefunden: ${inputPath}`);
  process.exit(1);
}

let html = await readFile(inputPath, 'utf8');

if (opts.data) {
  const dataPath = resolve(process.cwd(), opts.data);
  const json = JSON.parse(await readFile(dataPath, 'utf8'));
  html = Handlebars.compile(html)(json);
}

await mkdir(dirname(outputPath), { recursive: true });

const baseUrl = pathToFileURL(inputPath).href;

const headerTemplate = opts.header
  ? await readFile(resolve(process.cwd(), opts.header), 'utf8')
  : undefined;
const footerTemplate = opts.footer
  ? await readFile(resolve(process.cwd(), opts.footer), 'utf8')
  : undefined;

await htmlToPdf({
  html,
  baseUrl,
  outputPath,
  format: opts.format,
  landscape: Boolean(opts.landscape),
  margin: opts.margin,
  printBackground: opts.printBg !== false,
  scale: Number(opts.scale),
  headerTemplate,
  footerTemplate,
});

console.log(`PDF erstellt: ${outputPath}`);
