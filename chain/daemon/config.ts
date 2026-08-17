import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';

export const CHAIN_ROOT = join(import.meta.dir, '..');

// .env is optional; process env wins.
const envPath = join(CHAIN_ROOT, '.env');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}

function resolvePath(p: string): string {
    return p.startsWith('/') ? p : join(CHAIN_ROOT, p);
}

export const config = {
    rpcUrl: process.env.RPC_URL ?? 'https://api.devnet.solana.com',
    dbPath: resolvePath(process.env.DB_PATH ?? '../server/engine/db.sqlite'),
    daemonPort: parseInt(process.env.BRIDGE_DAEMON_PORT ?? '7781', 10),
    registryPath: resolvePath(process.env.BRIDGE_REGISTRY_PATH ?? 'registry/registry.json'),
    keypairPath: resolvePath(process.env.BRIDGE_KEYPAIR_PATH ?? '.keys/bridge.json'),
    vaultKeypairPath: resolvePath(process.env.VAULT_KEYPAIR_PATH ?? '.keys/vault.json'),
    paused: process.env.BRIDGE_PAUSED === '1'
};

export function loadKeypair(path: string): Keypair {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

export function makeConnection(): Connection {
    return new Connection(config.rpcUrl, 'confirmed');
}
