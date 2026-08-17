// Bridge daemon: the chain-side half of the exchange.
//   bun daemon/index.ts
// Requires: registry with on-chain addresses, bridge + vault keypairs, and the
// engine's sqlite (DB_PATH). See chain/README.md.

import { config } from './config';
import { DepositListener } from './deposit-listener';
import { WithdrawWorker } from './withdraw-worker';

console.log(`[bridge-daemon] starting (rpc=${config.rpcUrl.split('?')[0]}, db=${config.dbPath}, paused=${config.paused})`);

new DepositListener().start();
await new WithdrawWorker().start();
