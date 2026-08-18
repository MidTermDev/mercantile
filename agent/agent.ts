// Mercantile agent harness — an LLM plays your character and you steer it with prompts.
//
//   DEEPSEEK_API_KEY=sk-... bun agent/agent.ts <username> [--port 8799] [--model deepseek-chat]
//
// It (1) starts your character's game client, (2) connects the SDK, (3) runs a decision
// loop (DeepSeek by default — fast + cheap; any OpenAI-compatible endpoint works), and
// (4) serves a local console at http://localhost:<port> to WATCH the agent and PROMPT it
// on the go. Set the goal from the console ("chop yews and bank them", "fish shrimp",
// "kill goblins for loot") and change it any time. Without an API key it falls back to a
// simple heuristic so you can still see the loop run.

import { spawn } from "bun";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { runScript } from "../sdk/runner";

const REPO = join(import.meta.dir, "..");
const username = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!username) { console.error("usage: bun agent/agent.ts <username> [--port N] [--model M]"); process.exit(1); }
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; };
const PORT = parseInt(arg("--port", "8799"), 10);
const MODEL = arg("--model", "deepseek-chat");
const BASE = process.env.LLM_BASE_URL || "https://api.deepseek.com";

// pull DEEPSEEK_API_KEY from env or bots/<user>/bot.env
function envFromBot(key: string): string | undefined {
  const p = join(REPO, "bots", username!, "bot.env");
  if (process.env[key]) return process.env[key];
  if (existsSync(p)) for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && m[1] === key) return m[2].trim(); }
  return undefined;
}
const API_KEY = envFromBot("DEEPSEEK_API_KEY") || process.env.LLM_API_KEY;

// ── shared state for the console ──────────────────────────────────────────────
const MAX_LOG = 200;
const world = {
  goal: "" as string,
  paused: false,
  logs: [] as { t: number; kind: string; text: string }[],
  status: "starting" as string,
  snapshot: {} as Record<string, unknown>,
};
function log(kind: string, text: string) {
  world.logs.push({ t: Date.now(), kind, text });
  if (world.logs.length > MAX_LOG) world.logs.shift();
  console.log(`[${kind}] ${text}`);
}

// ── 1. start the character's headless game client ─────────────────────────────
log("sys", `starting game client for ${username}…`);
const lite = spawn(["bun", "src/lite/runner.ts", username!], { cwd: join(REPO, "server", "webclient"), stdout: "pipe", stderr: "pipe" });
// give it time to log into the world
await new Promise((r) => setTimeout(r, 16000));

// ── the action vocabulary the LLM may choose from ─────────────────────────────
const TOOLS = `Return ONE action as compact JSON: {"action":"<name>","args":{...},"reason":"<short>"}.
Actions:
- move_to {x:int, z:int}            walk to world coordinates
- chop {target?:string}            chop a nearby tree (target regex e.g. "oak")
- mine {target:string}             mine a rock (e.g. "copper", "iron")
- fish {target?:string, option?:string}  fish a spot (option e.g. "net","bait","cage")
- interact {target:string, option:string}  generic: use an option on a nearby object
- attack {target:string}           attack an NPC (e.g. "goblin")
- talk_to {target:string}          talk to an NPC
- pickup {target:string}           pick up a ground item
- eat {target:string}              eat food to heal
- equip {target:string}            equip an inventory item
- deposit_all                      open the nearest bank and deposit everything
- say {text:string}                say something in chat
- wait {ticks:int}                 wait N game ticks (0.6s each)
- done {note?:string}              the goal is complete; idle until a new prompt`;

// ── build a concise state summary for the LLM ─────────────────────────────────
function summarize(sdk: any): Record<string, unknown> {
  const st = sdk.getState?.();
  const p = st?.player ?? {};
  const inv: Record<string, number> = {};
  for (const it of sdk.getInventory?.() ?? []) inv[it.name] = (inv[it.name] ?? 0) + (it.count ?? 1);
  const npcs = (st?.npcs ?? []).slice(0, 8).map((n: any) => n.name).filter(Boolean);
  const locs = (st?.locs ?? st?.objs ?? []).slice(0, 10).map((l: any) => l.name).filter(Boolean);
  return {
    pos: [p.worldX, p.worldZ], hp: p.hp ?? p.health, level: p.combatLevel,
    inventory: inv, inventoryFree: 28 - (sdk.getInventory?.().length ?? 0),
    nearbyNpcs: [...new Set(npcs)], nearbyObjects: [...new Set(locs)],
    dialogOpen: !!st?.dialog?.isOpen,
  };
}

// ── decide the next action (DeepSeek, or heuristic fallback) ───────────────────
const history: string[] = [];
async function decide(state: Record<string, unknown>, goal: string): Promise<any> {
  if (!API_KEY) return heuristic(state, goal);
  const sys = `You are an expert RuneScape (2004) player controlling a character through a tool API.
Pursue the player's GOAL efficiently. Think about the current state, pick the single best next action.
Prefer acting over waiting. If you can't see a needed object/npc nearby, move toward where it would be or explore.
${TOOLS}`;
  const user = `GOAL: ${goal}\nSTATE: ${JSON.stringify(state)}\nRECENT: ${history.slice(-6).join(" | ")}\nRespond with ONE action JSON only.`;
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.3, response_format: { type: "json_object" }, max_tokens: 200 }),
    });
    const j: any = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(txt.replace(/```json|```/g, "").trim());
  } catch (e: any) {
    log("warn", `LLM error: ${String(e.message ?? e).slice(0, 80)} — falling back`);
    return heuristic(state, goal);
  }
}
// keyless demo brain: crude keyword → action so the loop is visible without a key
function heuristic(state: any, goal: string): any {
  const g = goal.toLowerCase();
  if (g.includes("chop") || g.includes("wood") || g.includes("log")) return { action: "chop", args: {}, reason: "goal mentions woodcutting" };
  if (g.includes("fish")) return { action: "fish", args: {}, reason: "goal mentions fishing" };
  if (g.includes("mine") || g.includes("ore")) return { action: "mine", args: { target: g.match(/copper|tin|iron|coal|gold|mithril/)?.[0] ?? "copper" }, reason: "goal mentions mining" };
  if (g.includes("bank") || g.includes("deposit")) return { action: "deposit_all", args: {}, reason: "goal mentions banking" };
  if (state.inventoryFree === 0) return { action: "deposit_all", args: {}, reason: "inventory full" };
  return { action: "wait", args: { ticks: 3 }, reason: "no clear heuristic (set DEEPSEEK_API_KEY for a real brain)" };
}

// ── execute an action via the SDK ─────────────────────────────────────────────
async function execute(bot: any, sdk: any, a: any): Promise<string> {
  const args = a.args ?? {};
  switch (a.action) {
    case "move_to": { const r = await bot.walkTo(args.x, args.z, 2); return r?.message ?? "walked"; }
    case "chop": { const r = await bot.chopTree(args.target ? new RegExp(args.target, "i") : undefined); return r?.message ?? "chopped"; }
    case "mine": { const r = await bot.interactLoc(new RegExp(args.target, "i"), "mine"); return r?.message ?? "mined"; }
    case "fish": { const r = await bot.interactLoc(args.target ? new RegExp(args.target, "i") : /fishing spot/i, args.option ?? "net"); return r?.message ?? "fished"; }
    case "interact": { const r = await bot.interactLoc(new RegExp(args.target, "i"), args.option); return r?.message ?? "interacted"; }
    case "attack": { const r = await bot.attack(new RegExp(args.target, "i")); return r?.message ?? "attacked"; }
    case "talk_to": { const r = await bot.talkTo(new RegExp(args.target, "i")); return r?.message ?? "talked"; }
    case "pickup": { const r = await bot.pickupItem(new RegExp(args.target, "i")); return r?.message ?? "picked up"; }
    case "eat": { const r = await bot.eatFood(new RegExp(args.target, "i")); return r?.message ?? "ate"; }
    case "equip": { const r = await bot.equipItem(new RegExp(args.target, "i")); return r?.message ?? "equipped"; }
    case "deposit_all": { await bot.openBank(); for (const it of [...new Set(sdk.getInventory().map((i: any) => i.name))]) await bot.depositItem(new RegExp(`^${it}$`, "i")).catch(() => {}); await bot.closeInterface?.(); return "deposited all"; }
    case "say": { await sdk.say(String(args.text ?? "")); return "said"; }
    case "wait": { await sdk.waitForTicks(Math.min(args.ticks ?? 2, 10)); return "waited"; }
    case "done": { world.goal = ""; return `goal done: ${args.note ?? ""}`; }
    default: await sdk.waitForTicks(2); return `unknown action ${a.action}`;
  }
}

// ── console (watch + prompt) ──────────────────────────────────────────────────
const CONSOLE_HTML = (u: string) => `<!doctype html><html><head><meta charset=utf8>
<title>${u} · Mercantile Agent</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark}body{margin:0;background:#0d1712;color:#e8e2d0;font:14px/1.5 -apple-system,Segoe UI,Inter,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #29433599;background:#0f1c16}
h1{font-family:Georgia,serif;color:#e8b923;font-size:18px;margin:0;letter-spacing:.05em}
.wrap{display:grid;grid-template-columns:1fr 1.2fr;gap:16px;padding:16px;max-width:1100px;margin:0 auto}
.card{background:#13221a;border:1px solid #29433599;border-radius:12px;padding:14px}
.k{color:#9db3a4;font-size:12px}.v{font-family:ui-monospace,monospace}
.log{height:52vh;overflow:auto;font-family:ui-monospace,monospace;font-size:12.5px}
.log div{padding:3px 0;border-bottom:1px solid #ffffff0d}
.act{color:#e8b923}.obs{color:#9db3a4}.sys{color:#37d39a}.warn{color:#e06a5a}
input,button{font:inherit}#p{width:100%;background:#0c1611;border:1px solid #2c4a3a;color:#e8e2d0;border-radius:8px;padding:10px}
button{background:linear-gradient(180deg,#f2c94a,#cf9d10);color:#241a00;font-weight:700;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}
.pill{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:#9db3a4}
.dot{width:8px;height:8px;border-radius:50%;background:#37d39a}
.goal{color:#e8b923}.chip{border:1px solid #2c4a3a;border-radius:6px;padding:2px 6px;color:#9db3a4;font-size:11px}
</style></head><body>
<header><h1>⚖ MERCANTILE AGENT</h1><span class=pill><span class=dot></span> ${u}</span><span id=st class=pill></span></header>
<div class=wrap>
 <div class=card>
   <div class=k>GOAL</div><div id=goal class=goal style="min-height:1.4em">—</div>
   <form id=f style="display:flex;gap:8px;margin:10px 0 4px">
     <input id=p placeholder="Tell your agent what to do… (e.g. chop yews and bank them)">
     <button>Send</button>
   </form>
   <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><button id=pause type=button style="background:#243b2e;color:#e8e2d0">Pause</button><span class=chip>▲ live view — this dashboard is your window into the agent</span></div>
   <div class=k style="margin-top:6px">STATE</div>
   <div id=state class=v style="font-size:12.5px;white-space:pre-wrap"></div>
 </div>
 <div class=card>
   <div class=k>ACTION LOG</div>
   <div id=log class=log></div>
 </div>
</div>
<script>
async function poll(){try{const r=await fetch('/state');const d=await r.json();
 document.getElementById('goal').textContent=d.goal||'— (idle, send a prompt)';
 document.getElementById('st').textContent=d.paused?'paused':d.status;
 const s=d.snapshot||{};document.getElementById('state').textContent=
   'pos '+(s.pos||[])+'  hp '+(s.hp??'?')+'\\nfree slots '+(s.inventoryFree??'?')+
   '\\ninv: '+Object.entries(s.inventory||{}).map(([k,v])=>k+' x'+v).join(', ')+
   '\\nnpcs: '+(s.nearbyNpcs||[]).join(', ')+'\\nobjects: '+(s.nearbyObjects||[]).join(', ');
 const L=document.getElementById('log');const near=L.scrollTop+L.clientHeight>=L.scrollHeight-40;
 L.innerHTML=(d.logs||[]).map(function(e){return '<div class='+e.kind+'>'+new Date(e.t).toLocaleTimeString()+' · '+e.text.replace(/</g,'&lt;')+'</div>'}).join('');
 if(near)L.scrollTop=L.scrollHeight;
 document.getElementById('pause').textContent=d.paused?'Resume':'Pause';
}catch(e){}}
setInterval(poll,1500);poll();
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const p=document.getElementById('p');await fetch('/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:p.value})});p.value='';poll();};
document.getElementById('pause').onclick=async()=>{await fetch('/pause',{method:'POST'});poll();};
</script></body></html>`;

// ── run: connect the SDK, serve the console, loop ─────────────────────────────
runScript(async ({ bot, sdk }) => {
  const handler = {
    async fetch(req: Request) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response(CONSOLE_HTML(username!), { headers: { "content-type": "text/html" } });
      if (url.pathname === "/state") return Response.json({ goal: world.goal, paused: world.paused, status: world.status, snapshot: world.snapshot, logs: world.logs });
      if (url.pathname === "/prompt" && req.method === "POST") { const b = await req.json().catch(() => ({})); world.goal = String((b as any).text ?? "").slice(0, 400); world.paused = false; log("sys", `new goal: ${world.goal}`); return Response.json({ ok: true }); }
      if (url.pathname === "/pause" && req.method === "POST") { world.paused = !world.paused; log("sys", world.paused ? "paused" : "resumed"); return Response.json({ ok: true }); }
      return new Response("not found", { status: 404 });
    },
  };
  // Bind the requested port, or walk forward to the next free one so a busy port never kills the agent.
  let bound = 0;
  for (let p = PORT; p < PORT + 25 && !bound; p++) {
    try { Bun.serve({ port: p, hostname: "0.0.0.0", ...handler }); bound = p; }
    catch { /* in use — try the next */ }
  }
  if (!bound) { log("warn", `no free port near ${PORT} — console disabled`); }
  else if (bound !== PORT) log("sys", `port ${PORT} busy — using ${bound}`);
  log("sys", `console ready → http://localhost:${bound || PORT}   (LLM: ${API_KEY ? MODEL + " @ " + BASE : "none — heuristic demo mode; set DEEPSEEK_API_KEY"})`);

  // fresh agent accounts spawn on Tutorial Island, which blocks normal play — skip it once.
  try {
    const st = sdk.getState?.();
    const px = st?.player?.worldX ?? 0, pz = st?.player?.worldZ ?? 0;
    const onTutorial = px >= 3040 && px <= 3135 && pz >= 3060 && pz <= 3140;
    if (onTutorial) {
      world.status = "skipping tutorial";
      log("sys", "on Tutorial Island — skipping…");
      const r = await bot.skipTutorial();
      log("sys", r?.success ? "tutorial skipped — on the mainland" : `skipTutorial: ${r?.message ?? "done"}`);
    }
  } catch (e: any) { log("warn", `skipTutorial failed: ${String(e.message ?? e).slice(0, 80)}`); }

  world.status = "ready";
  for (;;) {
    world.snapshot = summarize(sdk);
    if (world.paused || !world.goal) { await sdk.waitForTicks(2); continue; }
    let action: any;
    try { action = await decide(world.snapshot, world.goal); } catch (e: any) { log("warn", `decide failed: ${String(e).slice(0, 80)}`); await sdk.waitForTicks(3); continue; }
    log("act", `${action.action} ${JSON.stringify(action.args ?? {})}${action.reason ? " — " + action.reason : ""}`);
    try { const res = await execute(bot, sdk, action); log("obs", res); history.push(`${action.action}->${res}`.slice(0, 60)); }
    catch (e: any) { log("warn", `action failed: ${String(e.message ?? e).slice(0, 80)}`); history.push(`${action.action}->error`); }
  }
}, { disconnectAfter: true });

process.on("exit", () => { try { lite.kill(); } catch {} });
process.on("SIGINT", () => { try { lite.kill(); } catch {}; process.exit(0); });
