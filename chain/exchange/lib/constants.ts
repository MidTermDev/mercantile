export const PROGRAM_ID = "H5C6RKWQzUdfS8tVzZb3uVcRw3EHCzghv7kWdMBTD2bS";
export const GP_MINT = "123B7bdJzDYGkrAg7i3JUi5TaHYP47dqmSiR5qPRSGP";
export const GP_DECIMALS = 6;
export const ITEM_DECIMALS = 1;
export const X_URL = "https://x.com/MercantileRS/";
export const GITHUB_URL = "https://github.com/MidTermDev/mercantile";
export const DEFAULT_RPC =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=eea40423-0fd8-4254-aada-f627b5ff6a66";
// Full URL of the playable browser client (the engine's vanilla client route).
// Defaults to the live production world; override with NEXT_PUBLIC_GAME_URL for
// a different deployment or a local build.
export const GAME_URL = process.env.NEXT_PUBLIC_GAME_URL || "https://play.mercantile.sh/rs2.cgi";
export const LOCAL_GAME_URL = "http://localhost:8888/rs2.cgi";
export const solscan = (a: string) => `https://solscan.io/token/${a}`;
export const solscanAcct = (a: string) => `https://solscan.io/account/${a}`;
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
