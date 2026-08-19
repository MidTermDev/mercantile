// Bridge daemon: the chain-side half of the exchange.
//   bun daemon/index.ts
// Requires: registry with on-chain addresses, bridge + vault keypairs, and the
// engine's sqlite (DB_PATH). See chain/README.md.

import { config } from './config';
import { DepositListener } from './deposit-listener';
import { WithdrawWorker } from './withdraw-worker';
import { startApprovalListener, reAlertPending } from './review';
import { startReportPolling } from './reports';

console.log(`[bridge-daemon] starting (rpc=${config.rpcUrl.split('?')[0]}, db=${config.dbPath}, paused=${config.paused}, reviewThreshold=${config.reviewThresholdGp.toLocaleString()} GP)`);

new DepositListener().start();
startApprovalListener();               // Telegram poller: withdrawal approve/reject + report ban/dismiss
void reAlertPending();                 // re-DM any withdrawals still awaiting review
startReportPolling();                  // M2: sweep abuse reports → Telegram review
await new WithdrawWorker().start();
