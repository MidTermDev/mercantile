export interface ExchangeItem {
  debugname: string;
  name: string;
  symbol: string;
  mint: string;
  pool: string;
  imageUri: string | null;
  uri: string | null;
  p0GpPerItem: number;
  lowalch: number;
  objId: number;
  certObjId: number | null;
  stackable: boolean;
  members: boolean;
}

export interface ItemsFile {
  network: string;
  programId: string;
  gp: { mint: string; decimals: number; symbol: string; name: string; imageUri: string | null };
  generatedAt: string;
  items: ExchangeItem[];
}

export type PricesFile = Record<string, { price: number; ts: number }>;
export type HistoryPoint = { t: number; price: number };
