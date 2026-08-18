export function fmtGp(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString("en-US");
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}
export function truncAddr(a: string, n = 4): string {
  return a.length <= n * 2 + 2 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}
export function ipfs(u: string | null | undefined): string {
  if (!u) return "";
  // normalise ipfs://CID and gateway urls to a reliable gateway
  const m = u.match(/\/ipfs\/([A-Za-z0-9]+)/) || u.match(/^ipfs:\/\/([A-Za-z0-9]+)/);
  return m ? `https://ipfs.io/ipfs/${m[1]}` : u;
}
