// AiBrain.ts — browser-side LLM agent.
//
// Runs entirely in the player's browser: it reads the live game state the bot
// modules already collect, asks a language model (the player's own key, held in
// localStorage and sent only to the chosen provider) for the next action, and
// feeds that action into the same ActionExecutor the SDK gateway uses. No server
// compute, no key ever touches our backend. Autonomous/background play is the
// clone-the-repo `agent/agent.ts` harness; this is the zero-install version.
//
// Wired in Client.ts after the BotOverlay is created, gated on `?ai=1`.

import type { BotOverlay } from './BotOverlay.js';
import type { BotAction, BotWorldState, NearbyNpc, NearbyLoc, InventoryItem } from './types.js';
import { formatWorldStateForAgent } from './formatters.js';

type Provider = 'deepseek' | 'openai' | 'anthropic' | 'custom';

interface ModelOpt { id: string; label: string }
interface ProviderInfo {
    label: string;
    base: string;         // chat endpoint base; anthropic is special-cased
    models: ModelOpt[];   // first entry is the default
    keyHint: string;
}

// First model in each list is the default. Game/spatial reasoning is hard — small/cheap models play
// poorly; $$$ = pricey, best play. You bring your own key, so cost is on you.
const PROVIDERS: Record<Provider, ProviderInfo> = {
    anthropic: {
        label: 'Anthropic (Claude) — best play', base: 'https://api.anthropic.com',
        keyHint: 'sk-ant-… from console.anthropic.com',
        models: [
            { id: 'claude-sonnet-5', label: 'Sonnet 5 — best all-round (recommended)' },
            { id: 'claude-opus-5', label: 'Opus 5 — most capable ($$$)' },
            { id: 'claude-fable-5', label: 'Fable 5 — premium ($$$)' },
            { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast + cheap' },
            { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet (legacy)' },
            { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (legacy, cheap)' },
        ],
    },
    openai: {
        label: 'OpenAI', base: 'https://api.openai.com/v1',
        keyHint: 'sk-… from platform.openai.com',
        models: [
            { id: 'gpt-4o', label: 'GPT-4o — strong all-round (recommended)' },
            { id: 'gpt-4.1', label: 'GPT-4.1 — strong' },
            { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini — cheap' },
            { id: 'gpt-4o-mini', label: 'GPT-4o mini — cheapest' },
            { id: 'o3', label: 'o3 — deep reasoning ($$$)' },
            { id: 'o3-mini', label: 'o3-mini — reasoning, cheaper' },
            { id: 'o1', label: 'o1 — reasoning ($$$)' },
        ],
    },
    deepseek: {
        label: 'DeepSeek (cheapest)', base: 'https://api.deepseek.com',
        keyHint: 'sk-… from platform.deepseek.com',
        models: [
            { id: 'deepseek-chat', label: 'deepseek-chat — fast + cheap' },
            { id: 'deepseek-reasoner', label: 'deepseek-reasoner — smarter, slower' },
        ],
    },
    custom: { label: 'Custom (OpenAI-compatible)', base: '', models: [{ id: '', label: '' }], keyHint: 'bearer token for your endpoint' },
};

interface AiConfig { provider: Provider; model: string; apiKey: string; baseUrl: string; }

const LS_KEY = 'mrc_ai_cfg';
const LS_UI = 'mrc_ai_ui';   // panel position / size / collapsed / hidden

interface UiState { left: number | null; top: number | null; width: number; height: number; collapsed: boolean; hidden: boolean; }

const SYSTEM = `You are an expert RuneScape (2004 / RS2) player controlling one character. You are given a live
world-state snapshot each turn and must choose the SINGLE best next action to pursue the player's GOAL.

How this works:
- You act one step at a time; the game advances between your actions, so you'll see the result next turn.
- Read "### Recent Messages" for feedback: "You get some logs" = success; "I can't reach that!" = pick a
  closer/reachable target or move first; "I'm already doing that" = wait, don't re-issue.
- Nearby NPCs/Objects list their distance (in tiles) and available options in [brackets]. Prefer the nearest
  reachable one. Reference targets by name; the runtime resolves the name to the right object.
- If a Dialog is open, advance it (talk_to the npc again to continue, or choose an option). If a shop/bank/
  modal is open and you don't need it, deposit or close it before doing anything else.
- If your inventory is full (0 free slots), bank or drop before continuing to gather.
- Don't repeat an action that just failed; change target or approach. Prefer acting over waiting.

Return ONE action as compact JSON only: {"action":"<name>","args":{...},"reason":"<short>"}. Actions:
- move_to {x:int, z:int}                 walk to world coordinates
- chop {target?:string}                  chop a nearby tree (target regex e.g. "oak")
- mine {target:string}                   mine a rock (e.g. "copper", "iron")
- fish {target?:string, option?:string}  fish a spot (option e.g. "net","bait","cage","harpoon")
- interact {target:string, option:string}  use an option on a nearby object
- attack {target:string}                 attack an npc (e.g. "goblin")
- talk_to {target:string}                talk to an npc
- pickup {target:string}                 pick up a nearby ground item
- eat {target?:string}                   eat food to heal
- equip {target:string}                  wield/wear an inventory item
- deposit_all                            bank everything (opens a nearby bank if needed)
- burn_logs {target?:string}             light logs from your inventory with a tinderbox (Firemaking)
- use_item {item:string, on:string}      use an inventory item on another item / a nearby object / an npc
- drop {target:string}                   drop an inventory item to free space
- choose {option}                        pick from an open dialog or skill menu (number or text; "continue" advances a dialog)
- enter_amount {value:int}               answer a "how many?" number prompt
- buy {item:string, amount?:int}         buy an item from an OPEN shop
- sell {item:string, amount?:int}        sell an inventory item to an OPEN shop
- withdraw {item:string, amount?:int}    withdraw an item from an OPEN bank (amount -1 = all)
- combat_style {style:string}            set attack style (Accurate/Aggressive/Defensive/Controlled)
- close                                  close an open shop/bank/menu/dialog
- say {text:string}                      say something in chat
- wait {ticks:int}                       wait N game ticks (0.6s each)
- done {note?:string}                    the goal is complete; idle until a new prompt

Skill / UI notes:
- Firemaking = burn_logs (tinderbox on logs — NOT interact; logs are inventory items, not world objects).
- Cooking = use_item raw food on a fire or range. Smelting/smithing = use ore/bar on furnace/anvil then choose.
- Combining items = use_item. "interact" is ONLY for world objects (trees, rocks, doors, banks) + needs target AND option.
- When a Dialog or skill menu (fletching, crafting, smithing) is open, use choose to advance/select. Shops: buy/sell.
  Bank: deposit_all to store, withdraw to take out. If a menu is blocking and you don't need it, close it.
- Navigation: walkTo pathfinds and opens doors. To bank, just call deposit_all — it auto-walks to the nearest bank
  when none is in view (keep calling it until the bank opens). DON'T guess bank tiles or wander with move_to.
- Woodcutting + Firemaking needs NO banking: chop until full, then burn_logs; if "you can't light a fire here",
  move_to one tile away and burn_logs again. Never smelt/smith unless the goal says so.`;

interface Decision { action: string; args?: any; reason?: string }

// Banks on the authentic 2004 map (world coords) — used to travel when none is in view.
const BANKS: Array<{ name: string; x: number; z: number }> = [
    { name: 'Draynor', x: 3092, z: 3243 },
    { name: 'Al Kharid', x: 3269, z: 3167 },
    { name: 'Varrock East', x: 3253, z: 3420 },
    { name: 'Varrock West', x: 3185, z: 3436 },
    { name: 'Falador East', x: 3013, z: 3355 },
    { name: 'Falador West', x: 2946, z: 3368 },
    { name: 'Edgeville', x: 3094, z: 3491 },
];

export class AiBrain {
    private overlay: BotOverlay;
    private cfg: AiConfig;
    private goal = '';
    private running = false;
    private busy = false;
    private history: string[] = [];
    private errors = 0;   // consecutive failures → auto-stop so a bad key/model can't loop-drain credits
    private timer: ReturnType<typeof setInterval> | null = null;

    // DOM
    private panel!: HTMLElement;
    private bodyEl!: HTMLElement;
    private logEl!: HTMLElement;
    private statusEl!: HTMLElement;
    private goalEl!: HTMLElement;
    private launcher?: HTMLElement;
    private collapseBtn?: HTMLButtonElement;
    private ui: UiState = { left: null, top: null, width: 320, height: 520, collapsed: false, hidden: false };

    constructor(overlay: BotOverlay) {
        this.overlay = overlay;
        this.cfg = this.loadCfg();
        this.loadUi();
        this.buildPanel();
        this.timer = setInterval(() => this.step(), 700);
        this.log('sys', 'AI panel ready. Pick a model, paste your key, set a goal, press Start.');
    }

    // ── config persistence (localStorage; the key never leaves the browser) ──
    private loadCfg(): AiConfig {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) { const c = JSON.parse(raw); return { provider: c.provider ?? 'deepseek', model: c.model ?? 'deepseek-chat', apiKey: c.apiKey ?? '', baseUrl: c.baseUrl ?? '' }; }
        } catch { /* ignore */ }
        return { provider: 'deepseek', model: 'deepseek-chat', apiKey: '', baseUrl: '' };
    }
    private saveCfg(): void { try { localStorage.setItem(LS_KEY, JSON.stringify(this.cfg)); } catch { /* ignore */ } }

    private loadUi(): void {
        try { const raw = localStorage.getItem(LS_UI); if (raw) this.ui = { ...this.ui, ...JSON.parse(raw) }; } catch { /* ignore */ }
    }
    private saveUi(): void { try { localStorage.setItem(LS_UI, JSON.stringify(this.ui)); } catch { /* ignore */ } }

    // ── the loop: one action per idle window ────────────────────────────────
    private step(): void {
        if (!this.running || !this.goal || this.busy) return;
        if (!this.overlay.isIdle()) return;
        this.busy = true;
        const state = this.overlay.getWorldStateForAi();
        if (!state) { this.busy = false; return; }
        // deterministic: clear the character-design screen without spending a model call
        if (state.modalOpen && state.modalInterface === 269) {
            this.log('sys', 'accepting character design');
            this.overlay.enqueueAiAction({ type: 'acceptCharacterDesign', reason: 'get past character creation' });
            this.busy = false; return;
        }
        this.decide(state).then((dec) => {
            if (!dec || !dec.action) { this.fail(dec ? 'model returned no action' : 'no decision from model'); return; }
            if (dec.action === 'done') { this.log('sys', `goal complete: ${dec.args?.note ?? ''}`); this.setGoal(''); this.errors = 0; return; }
            this.log('act', `${dec.action} ${JSON.stringify(dec.args ?? {})}${dec.reason ? ' — ' + dec.reason : ''}`);
            const action = this.resolve(dec, state);
            if (action) { this.overlay.enqueueAiAction(action); this.history.push(String(dec.action).slice(0, 40)); this.errors = 0; }
            else this.log('warn', `couldn't find a target for "${dec.action}" — try a different instruction`);
        }).catch((e) => {
            this.fail(`LLM error: ${String(e?.message ?? e).slice(0, 160)}`);
        }).finally(() => { this.busy = false; });
    }

    // Log a failure and auto-stop after a few in a row (protects the user's API credits).
    private fail(msg: string): void {
        this.log('warn', msg);
        if (++this.errors >= 4) {
            this.log('sys', 'stopped after repeated errors — check your model id + key, then Start again');
            this.stop();
            this.errors = 0;
        }
    }

    // ── the model call (browser fetch; provider-specific) ───────────────────
    private async decide(state: BotWorldState): Promise<Decision | null> {
        if (!this.cfg.apiKey) { this.log('warn', 'no API key set — paste one above and Save'); this.stop(); return null; }
        const freeSlots = 28 - (state.inventory?.length ?? 0);
        // The SAME rich, agent-tuned snapshot the SDK feeds Claude — not a stripped summary.
        const user = `${formatWorldStateForAgent(state, this.goal)}\n\nFree inventory slots: ${freeSlots}`
            + `\nYour recent actions: ${this.history.slice(-6).join(', ') || 'none'}`
            + `\n\nChoose the single best next action. Respond with ONE action JSON only.`;
        const text = this.cfg.provider === 'anthropic'
            ? await this.callAnthropic(SYSTEM, user)
            : await this.callOpenAI(SYSTEM, user);
        let parsed: any = null;
        try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
        catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fall */ } } }
        if (!parsed || typeof parsed.action !== 'string') {
            this.log('warn', `model reply had no action: ${String(text).slice(0, 140)}`);
            return null;
        }
        return parsed;
    }

    private async callOpenAI(system: string, user: string): Promise<string> {
        const base = (this.cfg.provider === 'custom' ? this.cfg.baseUrl : PROVIDERS[this.cfg.provider].base).replace(/\/$/, '');
        // Reasoning models (deepseek-reasoner, o1/o3, *-thinking) reject response_format + need more tokens.
        const reasoning = /reason|o1|o3|think/i.test(this.cfg.model);
        const body: any = { model: this.cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: reasoning ? 1200 : 300 };
        if (!reasoning) { body.temperature = 0.2; body.response_format = { type: 'json_object' }; }
        const r = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
            body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
        const j: any = await r.json();
        const content = j?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error(`empty reply (finish=${j?.choices?.[0]?.finish_reason ?? '?'})`);
        }
        return content;
    }

    private async callAnthropic(system: string, user: string): Promise<string> {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.cfg.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({ model: this.cfg.model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
        });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
        const j: any = await r.json();
        // Claude returns an array of content blocks; newer models may put a `thinking`
        // block first, so gather every text block rather than assuming content[0].
        const blocks: any[] = Array.isArray(j?.content) ? j.content : [];
        const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
        if (!text) throw new Error(`empty reply (stop=${j?.stop_reason ?? '?'}; blocks=${blocks.map((b) => b?.type).join(',') || 'none'})`);
        return text;
    }

    // ── name → concrete BotAction resolution against live state ──────────────
    private resolve(dec: Decision, s: BotWorldState): BotAction | null {
        const a = dec.args ?? {};
        const reason = String(dec.reason ?? dec.action ?? 'ai').slice(0, 80);
        switch (dec.action) {
            case 'move_to': {
                if (typeof a.x !== 'number' || typeof a.z !== 'number') return null;
                return { type: 'walkTo', x: a.x, z: a.z, reason };
            }
            case 'chop': return this.loc(s, a.target ?? 'tree', /chop|cut/i, reason);
            case 'mine': return this.loc(s, a.target ?? 'rock', /mine/i, reason);
            case 'fish': return this.loc(s, a.target ?? 'fishing spot', new RegExp(a.option ?? 'net|bait|cage|harpoon|lure|small net', 'i'), reason);
            case 'interact': {
                // no target → don't poke a random nearby object (that's how it opened the furnace);
                // only try the inventory recovery, else give up this turn.
                if (!a.target) return this.interactInventoryFallback(s, a.target, a.option, reason);
                const hit = this.loc(s, a.target, this.re(a.option, '.'), reason);
                // models often phrase firemaking / item-use as "interact" — fall back to the inventory
                return hit ?? this.interactInventoryFallback(s, a.target, a.option, reason);
            }
            case 'attack': return this.npc(s, a.target ?? '', /attack/i, reason, true);
            case 'talk_to': { const n = this.findNpc(s, a.target ?? ''); return n ? { type: 'talkToNpc', npcIndex: n.index, reason } : null; }
            case 'pickup': {
                const g = (s.groundItems ?? []).filter((x) => this.match(x.name, a.target)).sort((x, y) => (x.distance ?? 99) - (y.distance ?? 99))[0];
                return g ? { type: 'pickupItem', x: g.x, z: g.z, itemId: g.id, reason } : null;
            }
            case 'eat': return this.invUse(s, a.target ?? '', /eat|drink/i, reason);
            case 'equip': return this.invUse(s, a.target ?? '', /wield|wear|equip/i, reason);
            case 'burn_logs': case 'light': case 'firemake': return this.burnLogs(s, a.target, reason);
            case 'use_item': case 'use': return this.useItem(s, a.item ?? a.target, a.on ?? a.target2 ?? a.on_item, reason);
            case 'drop': { const it = (s.inventory ?? []).find((x) => this.match(x.name, a.target)); return it ? { type: 'dropItem', slot: it.slot, reason } : null; }
            case 'choose': case 'continue': case 'dialog': return this.choose(s, a.option ?? a.text ?? a.target, reason);
            case 'enter_amount': case 'amount': { const v = Number(a.value ?? a.amount); return Number.isFinite(v) ? { type: 'submitCountDialog', value: Math.max(0, Math.trunc(v)), reason } : null; }
            case 'buy': { const it = (s.shop?.shopItems ?? []).find((x) => this.match(x.name, a.item ?? a.target)); return it ? { type: 'shopBuy', slot: it.slot, amount: Math.trunc(a.amount ?? 1), reason } : null; }
            case 'sell': { const it = (s.shop?.playerItems ?? []).find((x) => this.match(x.name, a.item ?? a.target)); return it ? { type: 'shopSell', slot: it.slot, amount: Math.trunc(a.amount ?? 1), reason } : null; }
            case 'withdraw': { const it = (s.bank?.items ?? []).find((x) => this.match(x.name, a.item ?? a.target)); return it ? { type: 'bankWithdraw', slot: it.slot, amount: Math.trunc(a.amount ?? 1), reason } : null; }
            case 'combat_style': case 'set_style': return this.combatStyle(s, a.style ?? a.target, reason);
            case 'close': case 'close_interface': return s.shop?.isOpen ? { type: 'closeShop', reason } : { type: 'closeModal', reason };
            case 'deposit_all': return this.depositAll(s, reason);
            case 'say': return a.text ? { type: 'say', message: String(a.text).slice(0, 200), reason } : null;
            case 'wait': return { type: 'wait', ticks: Math.min(Math.max(1, a.ticks ?? 2), 10), reason };
            default: return { type: 'wait', ticks: 2, reason: `unknown action ${dec.action}` };
        }
    }

    private match(name: string, target?: string): boolean {
        if (!target) return true;
        try { return new RegExp(target, 'i').test(name); } catch { return name.toLowerCase().includes(String(target).toLowerCase()); }
    }
    private re(pat: unknown, dflt: string): RegExp {
        try { return new RegExp((pat as string) ?? dflt, 'i'); } catch { return new RegExp(dflt, 'i'); }
    }
    // When the model phrases an inventory action as "interact" (a common mistake), recover it.
    private interactInventoryFallback(s: BotWorldState, target: unknown, option: unknown, reason: string): BotAction | null {
        const inv = s.inventory ?? [];
        const txt = `${target ?? ''} ${option ?? ''}`.toLowerCase();
        // firemaking phrased as interact ("burn logs", "use tinderbox on logs", "light")
        if (/burn|light|fire|tinderbox|log/.test(txt)) {
            const fm = this.burnLogs(s, undefined, reason);
            if (fm) return fm;
        }
        // an inventory item carrying a held-option that matches (eat, bury, drink, empty…)
        if (option) {
            for (const it of inv.filter((x) => this.match(x.name, target as string))) {
                const o = (it.optionsWithIndex ?? []).find((x) => this.match(x.text, String(option)));
                if (o) return { type: 'useInventoryItem', slot: it.slot, optionIndex: o.opIndex, reason };
            }
        }
        return null;
    }
    private findNpc(s: BotWorldState, target: string): NearbyNpc | undefined {
        return (s.nearbyNpcs ?? []).filter((n) => this.match(n.name, target) && n.reachable !== false).sort((x, y) => (x.distance ?? 99) - (y.distance ?? 99))[0];
    }
    private loc(s: BotWorldState, target: string, optRe: RegExp, reason: string): BotAction | null {
        const cands = (s.nearbyLocs ?? []).filter((l) => this.match(l.name, target) && l.reachable !== false).sort((x, y) => (x.distance ?? 99) - (y.distance ?? 99));
        for (const l of cands) {
            const opt = (l.optionsWithIndex ?? []).find((o) => optRe.test(o.text));
            if (opt) return { type: 'interactLoc', x: l.x, z: l.z, locId: l.id, optionIndex: opt.opIndex, reason };
        }
        // fall back: first matching loc's first option
        const l = cands[0];
        if (l && l.optionsWithIndex?.length) return { type: 'interactLoc', x: l.x, z: l.z, locId: l.id, optionIndex: l.optionsWithIndex[0].opIndex, reason };
        return null;
    }
    private npc(s: BotWorldState, target: string, optRe: RegExp, reason: string, dflt = false): BotAction | null {
        const n = this.findNpc(s, target);
        if (!n) return null;
        const opt = (n.optionsWithIndex ?? []).find((o) => optRe.test(o.text));
        if (opt) return { type: 'interactNpc', npcIndex: n.index, optionIndex: opt.opIndex, reason };
        if (dflt && n.optionsWithIndex?.length) return { type: 'interactNpc', npcIndex: n.index, optionIndex: n.optionsWithIndex[0].opIndex, reason };
        return null;
    }
    private invUse(s: BotWorldState, target: string, optRe: RegExp, reason: string): BotAction | null {
        const items = (s.inventory ?? []).filter((it) => this.match(it.name, target));
        for (const it of items) {
            const opt = (it.optionsWithIndex ?? []).find((o) => optRe.test(o.text));
            if (opt) return { type: 'useInventoryItem', slot: it.slot, optionIndex: opt.opIndex, reason };
        }
        return null;
    }
    // pick from an open dialog or skill/interface menu, by number or by matching text
    private choose(s: BotWorldState, opt: unknown, reason: string): BotAction | null {
        const asNum = Number(opt);
        const wantContinue = opt == null || /^(continue|next|ok|proceed)$/i.test(String(opt));
        if (s.dialog?.isOpen) {
            const opts = s.dialog.options ?? [];
            if (wantContinue || opts.length === 0) return { type: 'clickDialogOption', optionIndex: 0, reason };
            if (Number.isFinite(asNum)) { const byIdx = opts.find((o) => o.index === asNum); if (byIdx) return { type: 'clickDialogOption', optionIndex: byIdx.index, reason }; }
            const byText = opts.find((o) => this.match(o.text, String(opt)));
            return { type: 'clickDialogOption', optionIndex: byText ? byText.index : 0, reason };
        }
        if (s.interface?.isOpen) {
            const opts = s.interface.options ?? [];
            let pick = Number.isFinite(asNum) ? opts.find((o) => o.index === asNum) : undefined;
            if (!pick) pick = opts.find((o) => this.match(o.text, String(opt)));
            if (pick && pick.componentId != null) return { type: 'clickComponent', componentId: pick.componentId, reason };
        }
        return null;
    }
    private combatStyle(s: BotWorldState, style: unknown, reason: string): BotAction | null {
        const styles = s.combatStyle?.styles ?? [];
        const asNum = Number(style);
        if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 3) return { type: 'setCombatStyle', style: Math.trunc(asNum), reason };
        const m = styles.find((o) => this.match(o.name, String(style)) || this.match(o.type, String(style)));
        return m ? { type: 'setCombatStyle', style: m.index, reason } : null;
    }
    private burnLogs(s: BotWorldState, target: string | undefined, reason: string): BotAction | null {
        const inv = s.inventory ?? [];
        const tinder = inv.find((it) => /tinderbox/i.test(it.name));
        const logs = inv.find((it) => /log/i.test(it.name) && this.match(it.name, target ?? 'log'))
            ?? inv.find((it) => /log/i.test(it.name));
        if (tinder && logs) return { type: 'useItemOnItem', sourceSlot: tinder.slot, targetSlot: logs.slot, reason };
        return null;
    }
    private useItem(s: BotWorldState, item: string | undefined, on: string | undefined, reason: string): BotAction | null {
        const inv = s.inventory ?? [];
        const src = inv.find((it) => this.match(it.name, item));
        if (!src) return null;
        // on another inventory item?
        const dstItem = inv.find((it) => it.slot !== src.slot && this.match(it.name, on));
        if (dstItem) return { type: 'useItemOnItem', sourceSlot: src.slot, targetSlot: dstItem.slot, reason };
        // on a nearby object?
        const loc = (s.nearbyLocs ?? []).filter((l) => this.match(l.name, on) && l.reachable !== false).sort((x, y) => (x.distance ?? 99) - (y.distance ?? 99))[0];
        if (loc) return { type: 'useItemOnLoc', itemSlot: src.slot, x: loc.x, z: loc.z, locId: loc.id, reason };
        // on an npc?
        const npc = this.findNpc(s, on ?? '');
        if (npc) return { type: 'useItemOnNpc', itemSlot: src.slot, npcIndex: npc.index, reason };
        return null;
    }
    private depositAll(s: BotWorldState, reason: string): BotAction | null {
        if (s.bank?.isOpen) {
            const it: InventoryItem | undefined = (s.inventory ?? [])[0];
            return it ? { type: 'bankDeposit', slot: it.slot, amount: it.count ?? 1, reason } : { type: 'closeModal', reason: 'inventory empty — done banking' };
        }
        // open a bank in view: booth/chest loc, or a banker npc
        const openLoc = this.loc(s, 'bank booth|bank chest|bank', /bank|use/i, reason);
        if (openLoc) return openLoc;
        const banker = this.npc(s, 'banker', /bank/i, reason);
        if (banker) return banker;
        // none nearby → travel to the closest known bank (walkTo pathfinds toward it over turns)
        const p = s.player;
        if (!p) return null;
        let best = BANKS[0], bestD = Infinity;
        for (const b of BANKS) { const d = Math.abs(b.x - p.worldX) + Math.abs(b.z - p.worldZ); if (d < bestD) { bestD = d; best = b; } }
        return { type: 'walkTo', x: best.x, z: best.z, running: true, reason: `travel to ${best.name} bank` };
    }

    // ── controls ────────────────────────────────────────────────────────────
    setGoal(g: string): void { this.goal = g.slice(0, 400); this.goalEl.textContent = this.goal || '— (idle)'; }
    start(): void { if (!this.goal) { this.log('warn', 'set a goal first'); return; } this.running = true; this.updateStatus(); this.log('sys', 'started'); }
    stop(): void { this.running = false; this.updateStatus(); this.log('sys', 'stopped'); }

    private updateStatus(): void {
        this.statusEl.textContent = this.running ? '● running' : '○ stopped';
        this.statusEl.style.color = this.running ? '#37d39a' : '#9db3a4';
    }

    // ── panel UI ─────────────────────────────────────────────────────────────
    private log(kind: 'sys' | 'act' | 'warn', text: string): void {
        const colors: Record<string, string> = { sys: '#9db3a4', act: '#e8b923', warn: '#e06a5a' };
        const d = document.createElement('div');
        d.style.cssText = `color:${colors[kind]};padding:2px 0;border-bottom:1px solid #ffffff10`;
        d.textContent = new Date().toLocaleTimeString() + ' · ' + text;
        this.logEl.appendChild(d);
        while (this.logEl.childElementCount > 120) this.logEl.removeChild(this.logEl.firstChild!);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    private buildPanel(): void {
        const stop = (e: Event) => e.stopPropagation();
        const p = document.createElement('div');
        p.id = 'mrc-ai';
        p.style.cssText = `position:fixed;z-index:100000;
            background:#0f1c16f2;border:1px solid #294335;border-radius:12px;color:#e8e2d0;
            font:12.5px/1.45 -apple-system,Segoe UI,Inter,sans-serif;box-shadow:0 10px 40px #000a;backdrop-filter:blur(6px);
            display:flex;flex-direction:column;overflow:hidden;resize:both;min-width:260px;min-height:170px;max-width:96vw;max-height:96vh`;
        // don't let clicks/keys/scroll reach the game behind the panel. NOTE: do NOT swallow
        // mousemove/mouseup here — the drag uses capture-phase document listeners, and swallowing
        // mouseup would strand a drag (panel "follows the cursor" forever).
        ['keydown', 'keyup', 'keypress', 'wheel', 'mousedown', 'click', 'contextmenu'].forEach((ev) => p.addEventListener(ev, stop));

        // ── header: title + status + collapse + hide (drag handle) ──
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #29433599;background:#13221a;cursor:move;user-select:none;flex:0 0 auto';
        head.innerHTML = `<span style="font-family:Georgia,serif;color:#e8b923;font-weight:700;letter-spacing:.05em">⚖ AI PLAYER</span>`;
        this.statusEl = document.createElement('span');
        this.statusEl.style.cssText = 'margin-left:auto;font-size:11px;color:#9db3a4';
        this.statusEl.textContent = '○ stopped';
        head.appendChild(this.statusEl);
        const btnCss = 'background:none;border:1px solid #2c4a3a;color:#9db3a4;border-radius:6px;width:22px;height:22px;cursor:pointer;font:inherit;line-height:1;padding:0';
        const collapseBtn = document.createElement('button'); collapseBtn.style.cssText = btnCss; collapseBtn.title = 'collapse';
        const hideBtn = document.createElement('button'); hideBtn.style.cssText = btnCss; hideBtn.textContent = '×'; hideBtn.title = 'hide';
        collapseBtn.onmousedown = (e) => e.stopPropagation();
        hideBtn.onmousedown = (e) => e.stopPropagation();
        collapseBtn.onclick = () => this.toggleCollapse();
        hideBtn.onclick = () => this.hidePanel();
        this.collapseBtn = collapseBtn;
        head.appendChild(collapseBtn); head.appendChild(hideBtn);
        head.addEventListener('mousedown', (e) => this.startDrag(e as MouseEvent));
        p.appendChild(head);

        const body = document.createElement('div');
        this.bodyEl = body;
        body.style.cssText = 'padding:11px 12px;display:flex;flex-direction:column;gap:8px;overflow:auto;flex:1 1 auto;min-height:0';
        const inputCss = 'width:100%;box-sizing:border-box;background:#0c1611;border:1px solid #2c4a3a;color:#e8e2d0;border-radius:7px;padding:7px 9px;font:inherit';

        // provider + model
        const prov = document.createElement('select');
        prov.style.cssText = inputCss;
        (Object.keys(PROVIDERS) as Provider[]).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = PROVIDERS[k].label; if (k === this.cfg.provider) o.selected = true; prov.appendChild(o); });

        // model: labeled dropdown for known providers, free-text for custom
        const modelSel = document.createElement('select');
        modelSel.style.cssText = inputCss;
        const modelInput = document.createElement('input');
        modelInput.style.cssText = inputCss; modelInput.placeholder = 'model id'; modelInput.value = this.cfg.model;

        const baseUrl = document.createElement('input');
        baseUrl.style.cssText = inputCss; baseUrl.placeholder = 'https://your-endpoint/v1'; baseUrl.value = this.cfg.baseUrl;

        const key = document.createElement('input');
        key.type = 'password'; key.style.cssText = inputCss; key.placeholder = PROVIDERS[this.cfg.provider].keyHint; key.value = this.cfg.apiKey;

        const refreshProvider = () => {
            const info = PROVIDERS[this.cfg.provider];
            const custom = this.cfg.provider === 'custom';
            key.placeholder = info.keyHint;
            baseUrl.style.display = custom ? '' : 'none';
            modelSel.style.display = custom ? 'none' : '';
            modelInput.style.display = custom ? '' : 'none';
            if (custom) { modelInput.value = this.cfg.model; return; }
            modelSel.innerHTML = '';
            for (const m of info.models) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; modelSel.appendChild(o); }
            if (!info.models.some((m) => m.id === this.cfg.model)) this.cfg.model = info.models[0].id;
            modelSel.value = this.cfg.model;
            this.saveCfg();
        };
        prov.onchange = () => { this.cfg.provider = prov.value as Provider; refreshProvider(); this.saveCfg(); };
        modelSel.onchange = () => { this.cfg.model = modelSel.value; this.saveCfg(); };
        modelInput.oninput = () => { this.cfg.model = modelInput.value.trim(); this.saveCfg(); };
        baseUrl.oninput = () => { this.cfg.baseUrl = baseUrl.value.trim(); this.saveCfg(); };
        key.oninput = () => { this.cfg.apiKey = key.value.trim(); this.saveCfg(); };

        const note = document.createElement('div');
        note.style.cssText = 'font-size:10.5px;color:#9db3a488';
        note.textContent = 'Key stays in this browser; sent only to your provider. Stronger models (Claude Sonnet, GPT-4o) play far better than small/cheap ones.';

        // goal
        this.goalEl = document.createElement('div');
        this.goalEl.style.cssText = 'color:#e8b923;min-height:1.3em;font-size:12px';
        this.goalEl.textContent = '— (idle)';

        const promptRow = document.createElement('div');
        promptRow.style.cssText = 'display:flex;gap:6px';
        const prompt = document.createElement('input');
        prompt.style.cssText = inputCss; prompt.placeholder = 'Tell it what to do… (e.g. chop oaks and bank)';
        const sendBtn = document.createElement('button');
        sendBtn.textContent = 'Set'; sendBtn.style.cssText = 'background:#243b2e;color:#e8e2d0;border:0;border-radius:7px;padding:0 12px;cursor:pointer;font:inherit';
        const submitGoal = () => { if (prompt.value.trim()) { this.setGoal(prompt.value.trim()); this.log('sys', `goal: ${this.goal}`); prompt.value = ''; if (!this.running) this.start(); } };
        sendBtn.onclick = submitGoal;
        prompt.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submitGoal(); });
        promptRow.appendChild(prompt); promptRow.appendChild(sendBtn);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px';
        const startBtn = document.createElement('button');
        startBtn.textContent = 'Start'; startBtn.style.cssText = 'flex:1;background:linear-gradient(180deg,#f2c94a,#cf9d10);color:#241a00;font-weight:700;border:0;border-radius:7px;padding:7px;cursor:pointer;font:inherit';
        const stopBtn = document.createElement('button');
        stopBtn.textContent = 'Stop'; stopBtn.style.cssText = 'flex:1;background:#243b2e;color:#e8e2d0;border:0;border-radius:7px;padding:7px;cursor:pointer;font:inherit';
        startBtn.onclick = () => this.start(); stopBtn.onclick = () => this.stop();
        btnRow.appendChild(startBtn); btnRow.appendChild(stopBtn);

        this.logEl = document.createElement('div');
        this.logEl.style.cssText = 'flex:1 1 auto;min-height:90px;overflow:auto;font-family:ui-monospace,monospace;font-size:11px;background:#0a130e;border:1px solid #1e3327;border-radius:7px;padding:6px';

        body.appendChild(prov); body.appendChild(modelSel); body.appendChild(modelInput); body.appendChild(baseUrl); body.appendChild(key); body.appendChild(note);
        const hr = document.createElement('div'); hr.style.cssText = 'height:1px;background:#29433566;margin:2px 0';
        body.appendChild(hr);
        const gl = document.createElement('div'); gl.style.cssText = 'font-size:10.5px;color:#9db3a4;text-transform:uppercase;letter-spacing:.15em'; gl.textContent = 'Goal';
        body.appendChild(gl); body.appendChild(this.goalEl);
        body.appendChild(promptRow); body.appendChild(btnRow); body.appendChild(this.logEl);
        p.appendChild(body);
        document.body.appendChild(p);
        this.panel = p;
        refreshProvider();

        // persist size as the user resizes (CSS resize:both), ignoring collapsed state
        try {
            const ro = new ResizeObserver(() => {
                if (this.ui.collapsed || this.ui.hidden) return;
                this.ui.width = Math.round(p.offsetWidth);
                this.ui.height = Math.round(p.offsetHeight);
                this.saveUi();
            });
            ro.observe(p);
        } catch { /* no ResizeObserver */ }

        this.buildLauncher();
        this.applyUi();
    }

    // ── position / size / collapse / hide ──────────────────────────────────
    private applyUi(): void {
        const p = this.panel;
        p.style.width = this.ui.width + 'px';
        // default anchor: top-right if never moved
        if (this.ui.left == null || this.ui.top == null) {
            p.style.left = ''; p.style.right = '12px'; p.style.top = '12px';
        } else {
            p.style.right = '';
            p.style.left = this.ui.left + 'px';
            p.style.top = this.ui.top + 'px';
        }
        this.applyCollapsed();
        this.applyHidden();
    }
    private applyCollapsed(): void {
        const c = this.ui.collapsed;
        this.bodyEl.style.display = c ? 'none' : '';
        this.panel.style.height = c ? 'auto' : this.ui.height + 'px';
        this.panel.style.resize = c ? 'none' : 'both';
        if (this.collapseBtn) { this.collapseBtn.textContent = c ? '▸' : '▾'; this.collapseBtn.title = c ? 'expand' : 'collapse'; }
    }
    private applyHidden(): void {
        this.panel.style.display = this.ui.hidden ? 'none' : 'flex';
        if (this.launcher) this.launcher.style.display = this.ui.hidden ? 'flex' : 'none';
    }
    private toggleCollapse(): void { this.ui.collapsed = !this.ui.collapsed; this.applyCollapsed(); this.saveUi(); }
    private hidePanel(): void { this.ui.hidden = true; this.applyHidden(); this.saveUi(); }
    private showPanel(): void { this.ui.hidden = false; this.applyHidden(); this.saveUi(); }

    private startDrag(e: MouseEvent): void {
        e.preventDefault();
        const rect = this.panel.getBoundingClientRect();
        const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
        const move = (ev: MouseEvent) => {
            const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
            let left = ev.clientX - offX, top = ev.clientY - offY;
            left = Math.max(0, Math.min(left, window.innerWidth - Math.min(w, 80)));
            top = Math.max(0, Math.min(top, window.innerHeight - 30));
            this.ui.left = Math.round(left); this.ui.top = Math.round(top);
            this.panel.style.right = ''; this.panel.style.left = left + 'px'; this.panel.style.top = top + 'px';
        };
        const up = () => {
            document.removeEventListener('mousemove', move, true);
            document.removeEventListener('mouseup', up, true);
            this.saveUi();
        };
        // capture phase so these fire even though the panel stops the bubble phase
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mouseup', up, true);
    }

    private buildLauncher(): void {
        const b = document.createElement('button');
        b.textContent = '⚖ AI';
        b.title = 'Open AI player';
        b.style.cssText = `position:fixed;bottom:14px;right:14px;z-index:100000;display:none;align-items:center;gap:6px;
            background:linear-gradient(180deg,#f2c94a,#cf9d10);color:#241a00;font-weight:700;border:0;border-radius:20px;
            padding:9px 14px;cursor:pointer;box-shadow:0 6px 20px #0008;font:13px/1 -apple-system,Segoe UI,sans-serif`;
        b.onmousedown = (e) => e.stopPropagation();
        b.onclick = () => this.showPanel();
        document.body.appendChild(b);
        this.launcher = b;
    }

    destroy(): void {
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.panel?.remove();
        this.launcher?.remove();
    }
}
