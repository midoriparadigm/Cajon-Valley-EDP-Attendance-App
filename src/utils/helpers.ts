// src/utils/helpers.ts — General utility functions for EDP Attendance App

/**
 * RFC 4122 v4 UUID.
 * `crypto.randomUUID` only exists in secure contexts (HTTPS / localhost), so an
 * on-prem deployment served over plain HTTP would lose it. `getRandomValues`
 * is available everywhere, so build the UUID from that.
 */
export const uuidv4 = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for ids that came from the database (uuid primary keys).
 * Sample/demo students use short numeric ids and must never be written to
 * Supabase — every such write would be rejected by the uuid column anyway.
 */
export const isUuid = (id: string): boolean => UUID_RE.test(id);

/** Calendar day in local time as YYYY-MM-DD (the en-CA locale formats dates that way). */
export const localDateIso = (d: Date = new Date()): string => d.toLocaleDateString('en-CA');

/** "3:02 PM" — the time format used on roster cards and in the daily record. */
export const formatClockTime = (d: Date = new Date()): string =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Formats milliseconds into MM:SS:CC countdown format (centiseconds)
 * Used for head injury timer display
 */
export const formatTimeWithMs = (ms: number) => {
    if (ms <= 0) return "00:00:00";
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${centis.toString().padStart(2, '0')}`;
};

/**
 * Plays a beeping alarm sound using Web Audio API
 * Used for head injury check reminders (3 beeps pattern)
 */
export const playAlarm = () => {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(0, t + 0.1);
        osc.frequency.setValueAtTime(880, t + 0.2);
        osc.frequency.setValueAtTime(0, t + 0.3);
        osc.frequency.setValueAtTime(880, t + 0.4);

        gain.gain.setValueAtTime(0.1, t);
        gain.gain.setValueAtTime(0.1, t + 0.5);
        gain.gain.linearRampToValueAtTime(0, t + 0.6);

        osc.start(t);
        osc.stop(t + 0.6);
    } catch (e) {
        console.error("Audio playback failed", e);
    }
};
