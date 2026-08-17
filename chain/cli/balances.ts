// Wallet holdings resolved through the registry.
// Usage: bun cli/balances.ts [address] [--json]   (default: bridge keypair)

import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection, bridgeKeypair, loadRegistry, GP_DECIMALS } from '../runner/lib/common';

const json = process.argv.includes('--json');
const addrArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const owner = addrArg ? new PublicKey(addrArg) : bridgeKeypair().publicKey;

const conn = connection();
const reg = loadRegistry();
const byMint = new Map<string, string>();
for (const [d, item] of Object.entries(reg.items)) if (item.mint) byMint.set(item.mint, d);

const resp = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID });
const rows: { name: string; amount: string }[] = [];
for (const { account } of resp.value) {
    const info = account.data.parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount === 0n) continue;
    if (info.mint === reg.gp.mint) {
        rows.push({ name: 'GP', amount: (Number(amount) / 10 ** GP_DECIMALS).toFixed(6) });
    } else {
        const name = byMint.get(info.mint);
        if (name) rows.push({ name, amount: amount.toString() });
    }
}
rows.sort((a, b) => a.name.localeCompare(b.name));

if (json) console.log(JSON.stringify({ owner: owner.toBase58(), holdings: rows }));
else {
    console.log(`holdings of ${owner.toBase58()}:`);
    for (const r of rows) console.log(`  ${r.name.padEnd(18)} ${r.amount}`);
    if (!rows.length) console.log('  (none)');
}
