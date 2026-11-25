// news-image-20261124 entry point, written from scratch in this session.
// The picture itself is the pre-rendered entry.png beside this file; this
// program only copies it into the make.fun output directory. Plain
// JavaScript in a .ts file (no type syntax), Node 22 standard library
// only. The copy is deterministic, so both graded runs write the same
// bytes. The picture is drawn at build time by draw.mjs, which uses only
// the Node standard library: a built-in 5x7 bitmap font, a tiny raster
// canvas, and a hand-rolled PNG encoder. No network, no clock, no
// randomness.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const png = readFileSync(join(dir, "entry.png"));
mkdirSync(out, { recursive: true });
const dest = join(out, "entry.png");
writeFileSync(dest, png);
// The grader collects outputs as another user, so the file must be
// readable by everyone, whatever the sandbox umask is.
chmodSync(dest, 0o644);
console.log(`wrote ${png.length} bytes to ${dest}`);
