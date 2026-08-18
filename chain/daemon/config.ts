import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import bs58 from 'bs58';

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
    // Hot operator key: signs program withdraws (mints) + pays fees/ATA rent.
    operatorKeypairPath: resolvePath(process.env.OPERATOR ?? '.keys/mainnet-operator.json'),
    paused: process.env.BRIDGE_PAUSED === '1',
    // Large GP withdrawals (>= this many GP) are held for a manual Telegram approval
    // before crediting on-chain. 0 disables the gate.
    reviewThresholdGp: parseInt(process.env.REVIEW_THRESHOLD_GP ?? '10000000', 10),
    tgBotToken: process.env.TG_BOT_TOKEN ?? '',
    tgChatId: process.env.TG_CHAT_ID ?? ''
};

export function loadKeypair(path: string): Keypair {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

// The hot operator key, preferring an env-provided secret (a fly.io / container
// secret arrives as an env var, not a file). Accepts either a JSON byte array
// (`[1,2,...]`) or a base58 string. Falls back to the keypair file otherwise.
export function loadOperatorKeypair(): Keypair {
    const secret = process.env.OPERATOR_SECRET_KEY?.trim();
    if (secret) {
        if (secret.startsWith('[')) {
            return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
        }
        return Keypair.fromSecretKey(bs58.decode(secret));
    }
    return loadKeypair(config.operatorKeypairPath);
}

export function makeConnection(): Connection {
    return new Connection(config.rpcUrl, 'confirmed');
}
