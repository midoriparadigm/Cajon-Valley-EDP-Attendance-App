// src/utils/helpers.ts — General utility functions for EDP Attendance App

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
