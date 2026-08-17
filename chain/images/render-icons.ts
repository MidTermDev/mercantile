// Headless render of every registry item's 32x32 game icon to a PNG (upscaled
// nearest-neighbor for crisp display). Uses the webclient's software ItemViewer
// (ObjType.getSprite) against a locally-running engine's cache endpoints.
//
//   1. start the engine locally (serves /crc, /config, /textures, /ondemand.zip)
//   2. bun images/render-icons.ts [--scale 8] [--only-file registry/staples.txt]
//
// GP uses the coins icon (obj 995). Output: chain/images/out/<debugname>.png + gp.png

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

// dom-shim must load before anything that touches document/canvas at module scope.
import '../../server/webclient/src/lite/dom-shim';
import { ItemViewer } from '../../server/webclient/src/viewer/ItemViewer';
import type { RegistryFile } from '../registry/schema';

const ENGINE_URL = process.env.ENGINE_WEB_URL ?? 'http://localhost:8888';
const OUT_DIR = join(import.meta.dir, 'out');
const REGISTRY = join(import.meta.dir, '..', 'registry', 'registry.json');

const scaleArg = process.argv.indexOf('--scale');
const SCALE = scaleArg !== -1 ? parseInt(process.argv[scaleArg + 1], 10) : 8;
const onlyFileArg = process.argv.indexOf('--only-file');
const only = onlyFileArg !== -1
    ? new Set(readFileSync(process.argv[onlyFileArg + 1], 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean))
    : null;

const COINS_OBJ_ID = 995;

/** Pix32 data is 0 = transparent, else 0x00RRGGBB (classic client sprite). */
function spriteToPng(data: Int32Array, w: number, h: number, scale: number): Buffer {
    const png = new PNG({ width: w * scale, height: h * scale });
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const px = data[x + y * w];
            const a = px === 0 ? 0 : 255;
            const r = (px >> 16) & 0xff;
            const g = (px >> 8) & 0xff;
            const b = px & 0xff;
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    const dx = x * scale + sx;
                    const dy = y * scale + sy;
                    const idx = (dx + dy * w * scale) << 2;
                    png.data[idx] = r;
                    png.data[idx + 1] = g;
                    png.data[idx + 2] = b;
                    png.data[idx + 3] = a;
                }
            }
        }
    }
    return PNG.sync.write(png);
}

const reg: RegistryFile = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const viewer = new ItemViewer();
console.log(`init ItemViewer against ${ENGINE_URL} ...`);
await viewer.init(ENGINE_URL);
console.log('init done, rendering...');

let ok = 0;
let missing = 0;
const manifest: Record<string, { objId: number; file: string }> = {};

function render(debugname: string, objId: number): void {
    const sprite = viewer.renderItemIcon(objId, 1, 0);
    if (!sprite) {
        missing++;
        console.warn(`no sprite: ${debugname} (obj ${objId})`);
        return;
    }
    // getSprite always returns a 32x32 icon buffer (data.length === 1024).
    const png = spriteToPng(sprite.data, 32, 32, SCALE);
    const file = `${debugname}.png`;
    writeFileSync(join(OUT_DIR, file), png);
    manifest[debugname] = { objId, file };
    ok++;
}

// GP first
if (!only || only.has('gp')) render('gp', COINS_OBJ_ID);

for (const [debugname, item] of Object.entries(reg.items)) {
    if (only && !only.has(debugname)) continue;
    render(debugname, item.objId);
    if (ok % 100 === 0) console.log(`  ${ok} rendered...`);
}

writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`done: ${ok} icons rendered, ${missing} missing, scale ${SCALE}x -> ${32 * SCALE}px`);
if (!existsSync(join(OUT_DIR, 'gp.png'))) console.warn('WARNING: gp.png not produced');
process.exit(0);
