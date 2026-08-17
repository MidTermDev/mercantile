import { tryParseBoolean, tryParseInt } from '#/util/TryParse.js';
import { loadWorldConfig, migrateFromLegacyEnv } from '#/util/WorldConfig.js';

// rs-sdk: 274 reads nested config from data/config/world.json only; it does NOT
// consult process.env. Deployments (fly.io [env], Docker -e, etc.) set the legacy
// flat env vars (WEB_PORT, LOGIN_SERVER, NODE_MEMBERS, ...), so overlay process.env
// on top of the loaded config — env vars win, absent keys fall back to world.json /
// defaults. Locally (no such vars set) this is a no-op.
const config = migrateFromLegacyEnv(loadWorldConfig(), process.env as Record<string, string>);

export default {
    runtime: {
        maxNpcs: 16383
    },
    ...config,

    // ---------------------------------------------------------------------------
    // rs-sdk back-compat + custom config.
    // 274 moved server config into the nested WorldConfig object (Environment.web.port,
    // Environment.node.xpRate, ...). The rs-sdk bot framework (src/web/, hiscores,
    // login security) was written against the older flat Environment.* names, so we
    // expose flat aliases that map onto the nested config, plus a handful of
    // rs-sdk-only keys read straight from the environment.
    // ---------------------------------------------------------------------------

    // flat aliases -> 274 nested config
    WEB_PORT: config.web.port,
    WEB_MANAGEMENT_PORT: config.web.managementPort,
    WEBSITE_REGISTRATION: config.website.registration,
    NODE_ID: config.node.id,
    NODE_PORT: config.node.port,
    NODE_MEMBERS: config.node.members,
    NODE_PRODUCTION: config.node.production,
    NODE_DEBUG: config.node.debug,
    NODE_HOP_TIME: config.node.hopTime,

    // rs-sdk-only keys (not part of upstream WorldConfig)
    WEB_SOCKET_TOKEN_PROTECTION: tryParseBoolean(process.env.WEB_SOCKET_TOKEN_PROTECTION, false),
    NODE_DEBUG_SOCKET: tryParseBoolean(process.env.NODE_DEBUG_SOCKET, false),
    // rs-sdk: default ON for 274. The 274 web client fetches on-demand assets over the
    // game WebSocket; with this off the engine terminates that socket and the client
    // stalls at ~60% ("Connecting to update server"). Required for the bot client to load.
    NODE_WS_ONDEMAND: tryParseBoolean(process.env.NODE_WS_ONDEMAND, true),
    NODE_INFINITE_RUN: tryParseBoolean(process.env.NODE_INFINITE_RUN, true),
    // When false, WordEnc.filter stops censoring chat (bad words, domains, TLDs)
    // but still normalizes casing. Also injected into the browser client via
    // bot.ejs/client.ejs so its local WordFilter matches; the lite client has no
    // config channel and reads PROFANITY_FILTER from bot.env instead.
    NODE_PROFANITY_FILTER: tryParseBoolean(process.env.NODE_PROFANITY_FILTER, true),
    NODE_RANDOM_EVENTS: tryParseBoolean(process.env.NODE_RANDOM_EVENTS, false),
    NODE_TICKRATE: tryParseInt(process.env.NODE_TICKRATE, 400),
    HISCORES_WEB_PORT: tryParseInt(process.env.HISCORES_WEB_PORT, 8889),
    HISCORES_HIDDEN_NAMES: (process.env.HISCORES_HIDDEN_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    BANNED_USERNAME_WORDS: (process.env.BANNED_USERNAME_WORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

    // rs-sdk bridge (on-chain exchange, see server/PATCHES.md and chain/README.md)
    // Path to chain/registry/registry.json; empty/missing = exchange closed.
    BRIDGE_REGISTRY_PATH: process.env.BRIDGE_REGISTRY_PATH || '',
    // Shared secret for /bridge/status admin endpoint; empty = endpoint disabled.
    BRIDGE_ADMIN_TOKEN: process.env.BRIDGE_ADMIN_TOKEN || '',
    // Local port of the bridge daemon's deposit listener (loopback only).
    BRIDGE_DAEMON_PORT: tryParseInt(process.env.BRIDGE_DAEMON_PORT, 7781),
    // Friend server bind host. The friend server's RELAY_* channel is an
    // unauthenticated remote-control surface — keep it loopback unless worlds
    // connect from other hosts.
    FRIEND_HOST: process.env.FRIEND_HOST || '127.0.0.1'
};
