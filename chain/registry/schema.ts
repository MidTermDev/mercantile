// Registry: the single source of truth binding game items <-> SPL mints <-> DAMM v2 pools.
// Keyed on debugname (stable across packs); numeric obj ids are cache-revision-scoped.

export interface RegistryGp {
    mint: string | null;
    decimals: number;
    symbol: string;
    name: string;
    /** Whole GP (UI units). Base units = totalSupply * 10^decimals. */
    totalSupply: string;
    /** Redemption vault ATA (daemon-controlled). ~1B GP. */
    vaultAta: string | null;
    treasuryAta: string | null;
    /** Whole GP transferred to the vault at creation. */
    vaultSupply: string;
    /** Metadata JSON URI (Pinata/IPFS). */
    uri?: string | null;
    imageUri?: string | null;
}

export interface RegistryItem {
    /** Base (uncerted) obj id from obj.pack. */
    objId: number;
    /** cert_<debugname> obj id, or null if the item has no noted form. */
    certObjId: number | null;
    name: string;
    desc: string;
    cost: number;
    /** max(trunc(cost*4/10), 1) — mirrors alchemy.rs2 scale(4,10,cost). */
    lowalch: number;
    /** Pool starting price = 0.9 * lowalch, in GP per item (UI units). */
    p0GpPerItem: number;
    /** <=10 chars, uppercase alphanumeric, de-duplicated deterministically. */
    symbol: string;
    /** Metadata JSON URI (Pinata/IPFS) — set by images/upload-metadata.ts, embedded on-chain via Metaplex. */
    uri: string;
    /** Pinata/IPFS image URL — set by images/upload-metadata.ts. */
    imageUri?: string | null;
    stackable: boolean;
    members: boolean;
    // Filled by the runner after on-chain confirmation:
    mint: string | null;
    pool: string | null;
    position: string | null;
    flags: string[];
}

export interface RegistryBridge {
    programId: string;
    configPda: string;
    mintAuthorityPda: string;
    operator: string;
    /** admin pubkey (upgrade authority / mint creator). */
    admin: string;
    deployedAt: string;
}

export interface RegistryFile {
    version: 1;
    network: 'devnet' | 'mainnet-beta';
    programId: string;
    /** On-chain bridge program (architecture revision 2). */
    bridge?: RegistryBridge;
    generatedAt: string;
    stats: {
        totalObjIds: number;
        authoredBlocks: number;
        tradeableBase: number;
        excluded: string[];
        lowalch1Count: number;
    };
    gp: RegistryGp;
    items: Record<string, RegistryItem>;
}

export function lowalch(cost: number): number {
    return Math.max(Math.trunc((cost * 4) / 10), 1);
}

/** Exact decimal string for P0 = lowalch * 9 / 10 — avoids float artifacts like
 *  0.9 * 52 = 46.800000000000004 leaking into on-chain price math. */
export function p0String(la: number): string {
    const x9 = la * 9; // integer
    return x9 % 10 === 0 ? String(x9 / 10) : `${Math.trunc(x9 / 10)}.${x9 % 10}`;
}

export function validateRegistry(reg: RegistryFile): string[] {
    const errors: string[] = [];
    if (reg.version !== 1) errors.push(`unknown version ${reg.version}`);
    const symbols = new Set<string>();
    for (const [debugname, item] of Object.entries(reg.items)) {
        if (item.objId < 0) errors.push(`${debugname}: bad objId`);
        if (item.lowalch !== lowalch(item.cost)) errors.push(`${debugname}: lowalch mismatch`);
        if (Math.abs(item.p0GpPerItem - 0.9 * item.lowalch) > 1e-9) errors.push(`${debugname}: p0 mismatch`);
        if (!/^[A-Z0-9]{1,10}$/.test(item.symbol)) errors.push(`${debugname}: bad symbol ${item.symbol}`);
        if (symbols.has(item.symbol)) errors.push(`${debugname}: duplicate symbol ${item.symbol}`);
        symbols.add(item.symbol);
    }
    return errors;
}
