import { Connection, Keypair } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryFile } from '../../registry/schema';

export const CHAIN_ROOT = join(import.meta.dir, '..', '..');
export const REGISTRY_PATH = join(CHAIN_ROOT, 'registry', 'registry.json');
export const JOURNAL_PATH = join(CHAIN_ROOT, 'registry', 'journal.jsonl');

export function loadEnv(): { rpcUrl: string; keypairPath: string } {
    // .env is optional; fall back to public devnet.
    const envPath = join(CHAIN_ROOT, '.env');
    if (existsSync(envPath)) {
        for (const line of readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^([A-Z_]+)=(.*)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
    }
    return {
        rpcUrl: process.env.RPC_URL ?? 'https://api.devnet.solana.com',
        keypairPath: process.env.BRIDGE_KEYPAIR_PATH ?? join(CHAIN_ROOT, '.keys', 'bridge.json'),
    };
}

export function connection(): Connection {
    return new Connection(loadEnv().rpcUrl, 'confirmed');
}

export function bridgeKeypair(): Keypair {
    const { keypairPath } = loadEnv();
    const raw = JSON.parse(readFileSync(keypairPath.startsWith('/') ? keypairPath : join(CHAIN_ROOT, keypairPath), 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadRegistry(): RegistryFile {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function saveRegistry(reg: RegistryFile): void {
    writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n');
}

export const GP_DECIMALS = 6;
export const ITEM_DECIMALS = 0;
export const SEED_PER_ITEM = 100n;
export const POOL_FEE_BPS = 100; // flat 1%, collected in GP (collectFeeMode OnlyB)
