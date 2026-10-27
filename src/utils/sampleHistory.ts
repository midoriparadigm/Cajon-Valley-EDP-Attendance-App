// src/utils/sampleHistory.ts — Made-up past days for the built-in sample students (demo only)
//
// Sample students exist only for this session, so they have no real history.
// So that a demo can show the history views (a student's past days, the
// Program Log for an earlier date), past weekdays are filled with plausible
// entries. They are repeatable (the same student and day always give the
// same entries), marked localOnly like every sample event so the UI labels
// them sample data, and never saved anywhere.
//
// Callers pass the built-in sample students only (isSampleStudent): real
// students' history comes from the database.

import type { Student, ProgramType } from '../types';
import type { AuditEvent, AuditEventType } from '../services/auditLog';
import { BEHAVIOR_CHECKLISTS } from '../constants';

const LEAD = 'Veronica Thomas (EDP)';
const COACH = 'Coach Mike (549 Sports)';
const SIGN_OFF = 'Thank you for your partnership,\nEDP Team — Cajon Valley School District';

const BEHAVIORS = BEHAVIOR_CHECKLISTS.green.filter(b => ['Hands-on', 'Defiance of staff directions', 'Inappropriate language', 'Classroom or campus disruption'].includes(b));
const ACTIVITIES = ['Soccer', '4-Square', 'Wall Ball', 'Gaga Ball', 'Playground', 'Swings'];
const FIRST_AID = ['Ice', 'Band-Aid', 'Washed/Cleaned', 'Rest'];

/** mulberry32, seeded from a string hash: the same key always gives the same sequence. */
const seeded = (key: string) => {
    let h = 1779033703 ^ key.length;
    for (let i = 0; i < key.length; i++) {
        h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const sampleHistoryEvents = (students: readonly Student[], isoDate: string, todayIso: string): AuditEvent[] => {
    if (isoDate >= todayIso) return [];
    const [y, m, d] = isoDate.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    if (day.getDay() === 0 || day.getDay() === 6) return [];
    const dateText = day.toLocaleDateString();

    const out: AuditEvent[] = [];
    students.forEach(s => {
        const rand = seeded(`${s.id}|${isoDate}`);
        const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
        /** A time between `from` and `from + span` minutes after midnight. */
        const time = (from: number, span: number) => {
            const t = from + Math.floor(rand() * span);
            return new Date(y, m - 1, d, Math.floor(t / 60), t % 60);
        };
        const later = (base: Date, mins: number) => new Date(base.getTime() + mins * 60_000);
        let n = 0;
        const push = (type: AuditEventType, program: ProgramType | undefined, at: Date, staffName: string, detail?: string, body?: string) => {
            out.push({
                id: `sample-${s.id}-${isoDate}-${n++}`, studentId: s.id, studentName: `${s.firstName} ${s.lastName}`,
                type, program, occurredAt: at.toISOString(), staffName, detail, body, persisted: false, localOnly: true,
            });
        };
        const guardian = s.guardians.find(g => g.type === 'Contact 1');
        const dear = `Dear ${guardian ? `${guardian.firstName} ${guardian.lastName}` : 'Parent/Guardian'},`;

        // Sunrise: about one student in four, released by the 8:00 batch check-out.
        if (rand() < 0.25) {
            push('check_in', 'sunrise', time(430, 40), LEAD);
            push('checked_out', 'sunrise', new Date(y, m - 1, d, 8, 0), LEAD, 'Sunrise batch checkout at 08:00');
        }

        // Sunset: most students, most days.
        if (rand() >= 0.85) return;
        const staff = rand() < 0.5 ? COACH : LEAD;
        push('check_in', 'sunset', time(880, 30), staff);

        const roll = rand();
        let letter: { type: string; text: string } | null = null;
        if (roll < 0.05) {
            const issues = [...new Set([pick(BEHAVIORS), pick(BEHAVIORS)])];
            push('behavior_submitted', 'sunset', time(930, 60), staff, `Level 1 (Green) · ${issues.length} behavior${issues.length === 1 ? '' : 's'} noted`);
            letter = {
                type: 'behavior',
                text: `${dear}\n\nThis is to let you know that ${s.firstName} received a Green Card behavior ticket at EDP today (${dateText}). Staff noted: ${issues.join(', ').toLowerCase()}.\n\n${s.firstName} talked with staff about making better choices, and the rest of the afternoon went well. Please take a moment to talk with ${s.firstName} about it at home.\n\n${SIGN_OFF}`,
            };
        } else if (roll < 0.08) {
            const activity = pick(ACTIVITIES);
            const aid = pick(FIRST_AID);
            push('we_care_submitted', 'sunset', time(930, 75), staff, `${activity} · first aid: ${aid}`);
            letter = {
                type: 'wecare',
                text: `${dear}\n\nWe wanted to let you know that ${s.firstName} had a minor bump during ${activity} at EDP today (${dateText}). Staff provided first aid (${aid.toLowerCase()}), and ${s.firstName} was able to return to activities.\n\nPlease reach out if you have any questions.\n\n${SIGN_OFF}`,
            };
        } else if (roll < 0.09) {
            const start = time(930, 45);
            push('head_injury_started', 'sunset', start, staff, 'Initial check · no symptoms noted');
            push('head_injury_check', 'sunset', later(start, 15), LEAD, '15-minute check · no symptoms noted');
            push('head_injury_check', 'sunset', later(start, 30), LEAD, '30-minute check · no symptoms noted');
            letter = {
                type: 'injury',
                text: `${dear}\n\n${s.firstName} bumped their head during play at EDP today (${dateText}). Staff followed our head injury protocol and checked on ${s.firstName} right away, at 15 minutes and at 30 minutes; no symptoms were noted.\n\nPlease keep an eye on ${s.firstName} this evening and contact your doctor if you notice headache, dizziness, or unusual sleepiness.\n\n${SIGN_OFF}`,
            };
        }

        const pickup = time(1020, 55);
        push('checked_out', 'sunset', pickup, LEAD, `Released to Contact 1: ${guardian ? `${guardian.firstName} ${guardian.lastName}` : 'guardian'} · confirmed by staff at pickup`);
        if (letter) {
            push('parent_report_sent', undefined, later(pickup, 10), LEAD, `${letter.type} · marked sent by email + text — delivery not connected`, letter.text);
        }
    });
    return out;
};
