#!/usr/bin/env node
/**
 * The reference images for `create`'s image-mode eval (plan §8.5).
 *
 * The plan asks for "reference images with known ground truth". The honest way
 * to have known ground truth is to draw the images from it: this script paints
 * a few tiny PNGs from a spec and writes that same spec out as
 * `ground-truth.json`, so what the eval holds a trace to is what is actually in
 * the pixels — not a measurement somebody once took and wrote down.
 *
 * Everything here is standard library: zlib for the PNG stream, and a CRC by
 * hand. Edges are drawn hard (no antialiasing) so a radius or a padding is an
 * exact number of pixels rather than a judgement call.
 *
 *   node evals/fixtures/images/make-images.js
 *
 * Re-run it only when a fixture changes, and commit the PNGs with the change.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The specs — these are the ground truth
// ---------------------------------------------------------------------------

const IMAGES = [
  {
    file: 'button-primary.png',
    describes: 'Button/Primary',
    archetype: 'button',
    page: { width: 200, height: 84, background: '#F8FAFC' },
    box: { x: 20, y: 20, width: 160, height: 44 },
    label: { x: 36, y: 32, width: 128, height: 20 },
    truth: {
      background: '#2563EB',
      'border-colour': '#1D4ED8',
      'border-width': '2px',
      radius: '8px',
      'text-colour': '#FFFFFF',
      'padding-top': '12px',
      'padding-bottom': '12px',
      'padding-left': '16px',
      'padding-right': '16px',
    },
  },
  {
    file: 'badge-info.png',
    describes: 'Badge/Info',
    archetype: 'badge',
    page: { width: 120, height: 60, background: '#FFFFFF' },
    box: { x: 20, y: 20, width: 80, height: 20 },
    label: { x: 28, y: 25, width: 64, height: 10 },
    truth: {
      background: '#EFF6FF',
      'border-colour': '#BFDBFE',
      'border-width': '1px',
      radius: '10px',
      'text-colour': '#1D4ED8',
      'padding-top': '5px',
      'padding-bottom': '5px',
      'padding-left': '8px',
      'padding-right': '8px',
    },
  },
];

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

const rgb = (hex) => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

/** Is (x, y) inside a rectangle with rounded corners? Hard edges, no blending. */
function insideRounded(x, y, box, radius) {
  const { x: left, y: top, width, height } = box;
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const right = left + width - 1;
  const bottom = top + height - 1;
  const corners = [
    [left + radius, top + radius, x < left + radius && y < top + radius],
    [right - radius, top + radius, x > right - radius && y < top + radius],
    [left + radius, bottom - radius, x < left + radius && y > bottom - radius],
    [right - radius, bottom - radius, x > right - radius && y > bottom - radius],
  ];
  for (const [cx, cy, applies] of corners) {
    if (!applies) continue;
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  }
  return true;
}

function paint(spec) {
  const { page, box, label, truth } = spec;
  const radius = Number.parseInt(truth.radius, 10);
  const border = Number.parseInt(truth['border-width'], 10);

  const pageColour = rgb(page.background);
  const fill = rgb(truth.background);
  const stroke = rgb(truth['border-colour']);
  const text = rgb(truth['text-colour']);

  const pixels = Buffer.alloc(page.width * page.height * 3);
  for (let y = 0; y < page.height; y += 1) {
    for (let x = 0; x < page.width; x += 1) {
      let colour = pageColour;
      if (insideRounded(x, y, box, radius)) {
        const inner = {
          x: box.x + border,
          y: box.y + border,
          width: box.width - border * 2,
          height: box.height - border * 2,
        };
        colour = insideRounded(x, y, inner, Math.max(0, radius - border)) ? fill : stroke;
      }
      if (x >= label.x && x < label.x + label.width && y >= label.y && y < label.y + label.height) {
        colour = text;
      }
      const at = (y * page.width + x) * 3;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// The PNG container
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const truth = {};
for (const spec of IMAGES) {
  const pixels = paint(spec);
  fs.writeFileSync(path.join(HERE, spec.file), png(spec.page.width, spec.page.height, pixels));
  truth[spec.file] = {
    describes: spec.describes,
    archetype: spec.archetype,
    size: { width: spec.box.width, height: spec.box.height },
    properties: spec.truth,
  };
  process.stdout.write(`wrote ${spec.file}\n`);
}

fs.writeFileSync(
  path.join(HERE, 'ground-truth.json'),
  `${JSON.stringify(
    {
      note:
        'Generated by make-images.js, which paints the PNGs from these numbers. The images and ' +
        'this file cannot disagree: re-run the script rather than editing either by hand.',
      images: truth,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write('wrote ground-truth.json\n');
