// Tests for FreeWrite's format-conversion layer.
//
// These tests target ONLY the documented format-module interface
// (src/main/formats/{txt,html,markdown,docx,pdf}.js + index.js):
//
//   Each format module exports:
//     name: string
//     extensions: string[]              (lowercase, no dot)
//     async serialize(html, ctx): Promise<Buffer|string>
//     async deserialize(data: Buffer): Promise<string>   (omitted for export-only formats)
//
//   index.js exports:
//     formats            // array of all modules
//     byExtension(ext)   // -> module | undefined  (ext lowercase, no dot)
//     saveFilters()      // -> [{name, extensions}]  (Word/docx FIRST)
//     openFilters()      // -> [{name:'All supported', extensions:[...]}, ...individual]
//
// pdf.js is export-only (no deserialize) and is NOT importable. We do NOT
// exercise pdf.serialize here because it needs an Electron runtime (createPdf).

import { describe, it, expect } from 'vitest';

import * as registry from '../src/main/formats/index.js';
// Format modules use named exports (export const name / export async function
// serialize ...), exactly as the registry's index.js consumes them
// (`import * as txt from './txt.js'`). Namespace imports give us a module
// object whose properties are those named exports.
import * as txt from '../src/main/formats/txt.js';
import * as html from '../src/main/formats/html.js';
import * as markdown from '../src/main/formats/markdown.js';
import * as docx from '../src/main/formats/docx.js';
import * as pdf from '../src/main/formats/pdf.js';

// --------------------------------------------------------------------------
// Markdown: round-trip preserves structural formatting
// --------------------------------------------------------------------------
describe('markdown format', () => {
  const sourceHtml =
    '<h1>Title</h1>' +
    '<p>Some <strong>bold</strong> and <em>italic</em> text.</p>' +
    '<ul><li>first</li><li>second</li></ul>';

  it('serialize produces Markdown with the expected markers', async () => {
    const md = await markdown.serialize(sourceHtml, {});
    expect(typeof md).toBe('string');

    // Heading marker.
    expect(md).toContain('# Title');
    // Bold (turndown emits ** by default).
    expect(md).toMatch(/\*\*bold\*\*/);
    // Italic (turndown emits _ or * — accept either).
    expect(md).toMatch(/[_*]italic[_*]/);
    // Unordered list items use '-' bullets per contract.
    expect(md).toMatch(/-\s+first/);
    expect(md).toMatch(/-\s+second/);
  });

  it('round-trips html -> md -> html keeping bold/italic/heading/list', async () => {
    const md = await markdown.serialize(sourceHtml, {});
    const backHtml = await markdown.deserialize(Buffer.from(md, 'utf8'));

    expect(backHtml).toMatch(/<h1[^>]*>\s*Title\s*<\/h1>/i);
    expect(backHtml).toMatch(/<strong>bold<\/strong>|<b>bold<\/b>/i);
    expect(backHtml).toMatch(/<em>italic<\/em>|<i>italic<\/i>/i);
    expect(backHtml).toMatch(/<li>\s*first\s*<\/li>/i);
    expect(backHtml).toMatch(/<li>\s*second\s*<\/li>/i);
  });

  it('deserialize accepts a string as well as a Buffer', async () => {
    // marked.parse works on strings; deserialize is documented to take a
    // Buffer, but Buffer.toString() is the natural path so a plain string
    // must also work for callers that pass text directly.
    const backHtml = await markdown.deserialize('# Hello\n\nworld');
    expect(backHtml).toMatch(/<h1[^>]*>\s*Hello\s*<\/h1>/i);
    expect(backHtml).toMatch(/world/);
  });
});

// --------------------------------------------------------------------------
// HTML: standalone document on serialize, body recovery on deserialize
// --------------------------------------------------------------------------
describe('html format', () => {
  const body = '<h1>Doc</h1><p>Hello <strong>world</strong>.</p>';

  it('serialize produces a standalone document containing the input body', async () => {
    const out = await html.serialize(body, {});
    expect(typeof out).toBe('string');

    // Doctype + charset meta present.
    expect(out.toLowerCase()).toContain('<!doctype html>');
    expect(out.toLowerCase()).toMatch(/<meta[^>]*charset/i);

    // The original body markup is embedded.
    expect(out).toContain('<h1>Doc</h1>');
    expect(out).toContain('Hello <strong>world</strong>.');
  });

  it('deserialize(serialize(x)) recovers the inner body html', async () => {
    const out = await html.serialize(body, {});
    const recovered = await html.deserialize(Buffer.from(out, 'utf8'));

    // Inner body markup is recovered; no <body> wrapper, no doctype.
    expect(recovered).toContain('<h1>Doc</h1>');
    expect(recovered).toContain('Hello <strong>world</strong>.');
    expect(recovered.toLowerCase()).not.toContain('<!doctype');
    expect(recovered.toLowerCase()).not.toContain('<body');
  });

  it('deserialize of a bare fragment (no body tag) returns it unchanged-ish', async () => {
    const fragment = '<p>just a fragment</p>';
    const recovered = await html.deserialize(Buffer.from(fragment, 'utf8'));
    expect(recovered).toContain('just a fragment');
  });
});

// --------------------------------------------------------------------------
// TXT: strip tags on serialize, wrap lines on deserialize
// --------------------------------------------------------------------------
describe('txt format', () => {
  it('serialize strips all tags but keeps visible text', async () => {
    const input =
      '<h1>Heading</h1>' +
      '<p>First paragraph.</p>' +
      '<p>Second paragraph.</p>';
    const out = await txt.serialize(input, {});
    expect(typeof out).toBe('string');

    // No angle brackets / tags remain.
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');

    // Visible text survives.
    expect(out).toContain('Heading');
    expect(out).toContain('First paragraph.');
    expect(out).toContain('Second paragraph.');

    // Block elements became newlines (paragraphs are separated).
    expect(out).toMatch(/First paragraph\.[\s\S]*\n[\s\S]*Second paragraph\./);
  });

  it('deserialize wraps each paragraph (blank-line separated) in <p>...</p>', async () => {
    // Per contract: "empty line -> paragraph break". A blank line between two
    // chunks yields two separate <p> elements.
    const text = 'Line one\n\nLine two';
    const out = await txt.deserialize(Buffer.from(text, 'utf8'));
    expect(out).toMatch(/<p[^>]*>\s*Line one\s*<\/p>/i);
    expect(out).toMatch(/<p[^>]*>\s*Line two\s*<\/p>/i);
    // Two distinct paragraphs.
    expect((out.match(/<p[^>]*>/gi) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('deserialize wraps a single line of text in a <p>', async () => {
    const out = await txt.deserialize(Buffer.from('Just one line', 'utf8'));
    expect(out).toMatch(/<p[^>]*>\s*Just one line\s*<\/p>/i);
  });

  it('round-trips visible text through serialize -> deserialize', async () => {
    const input = '<p>Alpha</p><p>Beta</p>';
    const text = await txt.serialize(input, {});
    const back = await txt.deserialize(Buffer.from(text, 'utf8'));
    expect(back).toContain('Alpha');
    expect(back).toContain('Beta');
    expect(back).toMatch(/<p[^>]*>/i);
  });
});

// --------------------------------------------------------------------------
// DOCX: real round-trip through @turbodocx/html-to-docx + mammoth
// --------------------------------------------------------------------------
describe('docx format', () => {
  it('serialize returns a non-trivial Buffer with the PK zip signature', async () => {
    const out = await docx.serialize(
      '<h1>Report</h1><p>The quick brown fox.</p>',
      {}
    );

    expect(Buffer.isBuffer(out)).toBe(true);
    // A real .docx (zip) is well over a few hundred bytes.
    expect(out.length).toBeGreaterThan(200);
    // ZIP local-file-header magic: 'PK' == 0x50 0x4B.
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
  });

  it('round-trips html -> docx -> html and recovers the original text', async () => {
    const text = 'The quick brown fox';
    const buf = await docx.serialize(`<p>${text}</p>`, {});
    expect(Buffer.isBuffer(buf)).toBe(true);

    const recovered = await docx.deserialize(buf);
    expect(typeof recovered).toBe('string');
    expect(recovered).toContain(text);
  }, 30000); // docx engines can be slow on first run
});

// --------------------------------------------------------------------------
// Registry: byExtension / saveFilters / openFilters
// --------------------------------------------------------------------------
describe('formats registry', () => {
  it('byExtension("docx") resolves to the Word Document module', () => {
    const m = registry.byExtension('docx');
    expect(m).toBeDefined();
    expect(m.name).toBe('Word Document');
    expect(m.extensions).toContain('docx');
  });

  it('byExtension is case-insensitive on extension input expectations', () => {
    // Contract: ext is lowercase, no dot. Confirm a couple of known mappings.
    expect(registry.byExtension('txt')?.name).toBe('Plain Text');
    expect(registry.byExtension('md')?.name).toBe('Markdown');
    expect(registry.byExtension('html')?.name).toBe('Web Page');
    expect(registry.byExtension('htm')?.name).toBe('Web Page');
    expect(registry.byExtension('pdf')?.name).toBe('PDF Document');
  });

  it('byExtension returns undefined for an unknown extension', () => {
    expect(registry.byExtension('xyz')).toBeUndefined();
  });

  it('formats array includes all five modules', () => {
    expect(Array.isArray(registry.formats)).toBe(true);
    const names = registry.formats.map((m) => m.name);
    expect(names).toContain('Word Document');
    expect(names).toContain('PDF Document');
    expect(names).toContain('Markdown');
    expect(names).toContain('Web Page');
    expect(names).toContain('Plain Text');
  });

  it('saveFilters()[0] is the Word/docx filter', () => {
    const filters = registry.saveFilters();
    expect(Array.isArray(filters)).toBe(true);
    expect(filters.length).toBeGreaterThan(0);

    const first = filters[0];
    expect(first.name).toBe('Word Document');
    expect(first.extensions).toContain('docx');
  });

  it('saveFilters() lists docx, then pdf, markdown, html, txt in order', () => {
    const filters = registry.saveFilters();
    // Map each filter to its primary extension for an order check.
    const orderedExts = filters.map((f) => f.extensions[0]);
    // docx must be first; pdf must precede the rest of the writeable formats.
    expect(orderedExts[0]).toBe('docx');
    expect(orderedExts.indexOf('pdf')).toBe(1);
    expect(orderedExts.indexOf('pdf')).toBeLessThan(orderedExts.indexOf('txt'));
  });

  it('openFilters() does NOT offer pdf as importable', () => {
    const filters = registry.openFilters();
    expect(Array.isArray(filters)).toBe(true);
    expect(filters.length).toBeGreaterThan(0);

    // First entry is the aggregate "All supported" filter.
    const all = filters[0];
    expect(all.name).toMatch(/all supported/i);
    expect(all.extensions).not.toContain('pdf');

    // No individual open filter offers pdf either.
    const everyExt = filters.flatMap((f) => f.extensions);
    expect(everyExt).not.toContain('pdf');

    // But the importable types ARE offered.
    expect(everyExt).toContain('docx');
    expect(everyExt).toContain('md');
    expect(everyExt).toContain('html');
    expect(everyExt).toContain('txt');
  });
});

// --------------------------------------------------------------------------
// PDF: export-only — no deserialize, excluded from open filters
// --------------------------------------------------------------------------
describe('pdf format (export-only)', () => {
  it('exposes name + extensions but has NO deserialize', () => {
    expect(pdf.name).toBe('PDF Document');
    expect(pdf.extensions).toContain('pdf');
    expect(pdf.deserialize).toBeUndefined();
    expect(typeof pdf.serialize).toBe('function');
  });

  it('is excluded from openFilters() (cannot be imported)', () => {
    const everyExt = registry.openFilters().flatMap((f) => f.extensions);
    expect(everyExt).not.toContain('pdf');
  });
});
