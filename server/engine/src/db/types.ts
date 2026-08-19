import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type account = {
    id: Generated<number>;
    username: string;
    password: string;
    registration_ip: string | null;
    registration_date: Generated<string>;
    muted_until: string | null;
    banned_until: string | null;
    bot_license_until: string | null;
    staffmodlevel: Generated<number>;
    members: Generated<number>;
};
export type account_login = {
    account_id: number;
    profile: string;
    logged_in: Generated<number>;
    login_time: string | null;
    logged_out: Generated<number>;
    logout_time: string | null;
};
export type account_wallet = {
    account_id: number;
    address: string;
    linked_at: Generated<string>;
    link_ip: string | null;
};
export type bridge_tx = {
    id: Generated<number>;
    direction: string;
    account_id: number;
    username: string;
    wallet: string;
    obj_debugname: string;
    obj_id: number;
    count: number;
    state: string;
    sig: string | null;
    last_valid_height: number | null;
    error: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
};
export type friendlist = {
    account_id: number;
    friend_account_id: number;
    profile: Generated<string>;
    created: Generated<string>;
};
export type hiscore = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    playtime: Generated<number>;
    date: Generated<string>;
};
export type hiscore_bank = {
    profile: Generated<string>;
    account_id: number;
    value: number;
    items: string;
    date: Generated<string>;
};
export type hiscore_large = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    playtime: Generated<number>;
    date: Generated<string>;
};
export type hiscore_outfit = {
    profile: Generated<string>;
    account_id: number;
    value: number;
    items: string;
    date: Generated<string>;
};
export type ignorelist = {
    account_id: number;
    value: string;
    profile: Generated<string>;
    created: Generated<string>;
};
export type input_report = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: string;
    data: Buffer;
};
export type ipban = {
    ip: string;
};
export type koth_capture = {
    id: Generated<number>;
    timestamp: string;
    profile: Generated<string>;
    username: string;
    combat_level: number;
    contenders: number;
    loadout: string;
};
export type player_skills_log = {
    id: Generated<number>;
    timestamp: string;
    username: string;
    total_xp: number;
    skills: string;
};
export type player_telemetry = {
    id: Generated<number>;
    timestamp: string;
    username: string;
    session_uuid: string | null;
    x: number;
    z: number;
    level: number;
    ip: string | null;
    total_xp: Generated<number>;
    skills: string | null;
};
export type player_telemetry_segment = {
    id: Generated<number>;
    username: string;
    session_uuid: string | null;
    ip: string | null;
    start_time: string;
    end_time: string;
    sample_count: number;
    data: Buffer;
};
export type private_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    timestamp: string;
    coord: number;
    to_account_id: number;
    message: string;
};
export type public_chat = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: string;
    coord: number;
    message: string;
};
export type report = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: string;
    coord: number;
    offender: string;
    reason: number;
    status: Generated<string>;
    reviewed_at: string | null;
};
export type session = {
    uuid: string;
    account_id: number;
    profile: string;
    world: number;
    timestamp: string;
    uid: number;
    ip: string | null;
};
export type session_log = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: string;
    coord: number;
    event: string;
    event_type: Generated<number>;
};
export type session_wealth = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: string;
    coord: number;
    event_type: Generated<number>;
    account_items: string;
    account_value: number;
    recipient_session: string | null;
    recipient_items: string | null;
    recipient_value: number | null;
};
export type DB = {
    account: account;
    account_login: account_login;
    account_wallet: account_wallet;
    bridge_tx: bridge_tx;
    friendlist: friendlist;
    hiscore: hiscore;
    hiscore_bank: hiscore_bank;
    hiscore_large: hiscore_large;
    hiscore_outfit: hiscore_outfit;
    ignorelist: ignorelist;
    input_report: input_report;
    ipban: ipban;
    koth_capture: koth_capture;
    player_skills_log: player_skills_log;
    player_telemetry: player_telemetry;
    player_telemetry_segment: player_telemetry_segment;
    private_chat: private_chat;
    public_chat: public_chat;
    report: report;
    session: session;
    session_log: session_log;
    session_wealth: session_wealth;
};
