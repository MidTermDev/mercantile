import fs from 'fs';
import { Worker } from 'worker_threads';

import { collectDefaultMetrics, register } from 'prom-client';

import { packAll } from '#tools/pack/PackAll.js';
import World from '#/engine/World.js';
import TcpServer from '#/server/tcp/TcpServer.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { startManagementWeb, startWeb } from '#/web.js';
import OnDemand from '#/engine/OnDemand.js';

if (OnDemand.cache.count(0) !== 9 || OnDemand.cache.count(2) === 0 || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    try {
        // todo: different logic so the main thread doesn't have to load pack files
        const modelFlags: number[] = [];
        await packAll(modelFlags);
    } catch (err) {
        if (err instanceof Error) {
            printError(err);
        }

        process.exit(1);
    }
}

if (Environment.easyStartup) {
    for (const server of ['login', 'friend', 'logger']) {
        const worker = new Worker(new URL(`./${server}.ts`, import.meta.url));
        worker.on('error', err => printError(`${server} server worker error: ${err.message ?? err}`));
        worker.on('exit', code => printError(`${server} server worker exited with code ${code}`));
    }
}

await World.start();

const tcpServer = new TcpServer();
tcpServer.start();

await startWeb();
await startManagementWeb();

register.setDefaultLabels({ nodeId: Environment.node.id });
collectDefaultMetrics({ register });

let exiting = false;
function safeExit() {
    if (exiting) {
        return;
    }

    exiting = true;
    // Give players an in-game "System update" countdown before shutting down, so nobody is
    // caught mid-action. The engine only exits after every player is logged out AND saved to
    // disk, so this window is purely notice. Default 100 ticks = 60s; tune with REBOOT_NOTICE_TICKS.
    const notice = parseInt(process.env.REBOOT_NOTICE_TICKS ?? '100', 10);
    World.rebootTimer(Number.isFinite(notice) && notice >= 0 ? notice : 100);
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);

process.on('uncaughtException', function (err) {
    console.error(err, 'Uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error({ promise, reason }, 'Unhandled Rejection at: Promise');
});
