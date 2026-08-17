// rs-sdk bridge ops (see server/PATCHES.md). All handlers are synchronous and
// only touch BridgeService in-memory state; DB work happens on the service's
// flush loop, off the tick path.

import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import { ActivePlayer, checkedHandler } from '#/engine/script/ScriptPointer.js';
import { BridgeService } from '#/engine/bridge/BridgeService.js';

const BridgeOps: CommandHandlers = {
    [ScriptOpcode.BRIDGE_WITHDRAW]: checkedHandler(ActivePlayer, state => {
        const count = state.popInt();
        const obj = state.popInt();
        state.pushInt(BridgeService.requestWithdraw(state.activePlayer, obj, count));
    }),

    [ScriptOpcode.BRIDGE_DEBIT_ACK]: checkedHandler(ActivePlayer, state => {
        const ok = state.popInt();
        const id = state.popInt();
        BridgeService.ackDebit(state.activePlayer, id, ok === 1);
    }),

    [ScriptOpcode.BRIDGE_CLAIM]: checkedHandler(ActivePlayer, state => {
        state.pushInt(BridgeService.beginClaim(state.activePlayer));
    }),

    [ScriptOpcode.BRIDGE_CREDIT_ACK]: checkedHandler(ActivePlayer, state => {
        const ok = state.popInt();
        const id = state.popInt();
        BridgeService.ackCredit(state.activePlayer, id, ok === 1);
    }),

    [ScriptOpcode.BRIDGE_PENDING]: checkedHandler(ActivePlayer, state => {
        state.pushInt(BridgeService.pendingCount(state.activePlayer));
    }),

    [ScriptOpcode.BRIDGE_WALLET_LINKED]: checkedHandler(ActivePlayer, state => {
        state.pushInt(BridgeService.isWalletLinked(state.activePlayer) ? 1 : 0);
    }),

    [ScriptOpcode.BRIDGE_LINK_CODE]: checkedHandler(ActivePlayer, state => {
        state.pushString(BridgeService.issueLinkCode(state.activePlayer));
    })
};

export default BridgeOps;
