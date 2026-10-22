// src/utils/csv.ts — CSV roster import parsing and CSV export for EDP Attendance App

import type { Student, GuardianContact, SubProgram } from '../types';
import { GRADES } from '../constants';
import { uuidv4 } from './helpers';

/** A problem with one specific record; the import continues past it. */
export interface RosterRowError {
    /** 1-based record number as the user sees it in a spreadsheet (header = row 1). */
    row: number;
    message: string;
}

export interface RosterParseResult {
    students: Student[];
    errors: RosterRowError[];
    /** Imported students that had no guardian contact in the file. */
    missingGuardianCount: number;
}

/** Thrown when the file as a whole is unusable (empty, no header, missing columns, broken quoting). */
export class RosterCsvError extends Error {}

/**
 * Splits RFC 4180 delimited text into rows of raw fields.
 *
 * Handles quoted fields, escaped double-quotes (""), embedded commas/newlines,
 * CRLF / LF / CR line endings, and a leading UTF-8 BOM.
 *
 * Strict where silence would lose data:
 *   • A quote only opens a quoted field at the very start of the field. A quote
 *     anywhere else (`He said "hi"`) is kept as a literal character.
 *   • A quoted field still open at end of file throws instead of quietly
 *     swallowing every following line into one cell.
 */
export const parseDelimited = (input: string): string[][] => {
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let atFieldStart = true;
    let line = 1;           // physical line, for error messages
    let quoteOpenedOnLine = 0;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
            field += ch; i++; continue;
        }

        if (ch === '"' && atFieldStart) {
            inQuotes = true; atFieldStart = false; quoteOpenedOnLine = line; i++; continue;
        }
        if (ch === ',') { row.push(field); field = ''; atFieldStart = true; i++; continue; }
        if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row);
            row = []; field = ''; atFieldStart = true; line++; i++; continue;
        }

        field += ch; atFieldStart = false; i++;
    }

    if (inQuotes) {
        throw new RosterCsvError(
            `Line ${quoteOpenedOnLine} opens a quoted value (") that is never closed. ` +
            'Fix the quote and re-upload — otherwise every line after it would be lost.',
        );
    }

    row.push(field);
    rows.push(row);
    return rows;
};

/** Canonical column names this importer understands. */
type RosterField =
    | 'elopId' | 'asesId' | 'firstName' | 'lastName' | 'grade'
    | 'guardianName' | 'guardianFirstName' | 'guardianLastName'
    | 'guardianPhone' | 'guardianEmail';

/**
 * Accepted header spellings per field, in priority order — an exact `elop_id`
 * column always wins over a generic `id` column.
 */
const FIELD_ALIASES: Record<RosterField, string[]> = {
    elopId: ['elop_id', 'elopid', 'student_id', 'studentid', 'sis_id', 'id'],
    asesId: ['ases_id', 'asesid'],
    firstName: ['first_name', 'firstname', 'first', 'given_name'],
    lastName: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
    grade: ['grade', 'grade_level', 'gradelevel'],
    guardianName: ['parent_name', 'guardian_name', 'parent', 'guardian'],
    guardianFirstName: ['guardian_first_name', 'parent_first_name', 'guardian_first', 'parent_first'],
    guardianLastName: ['guardian_last_name', 'parent_last_name', 'guardian_last', 'parent_last'],
    guardianPhone: ['parent_phone', 'guardian_phone', 'primary_phone', 'contact_phone', 'phone'],
    guardianEmail: ['parent_email', 'guardian_email', 'contact_email', 'email'],
};

/** `"  First Name "` → `first_name` so header casing/spacing does not matter. */
const normalizeHeader = (header: string): string =>
    header.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

/** District IDs compare case- and whitespace-insensitively ("a1001 " === "A1001"). */
const normalizeId = (id: string | undefined): string => (id ?? '').trim().toUpperCase();

/**
 * Maps district grade spellings onto the app's GRADES values.
 * Accepts `K`, `Kindergarten`, `TK`, `01`, `1`, `1st`, … Returns null if unknown.
 */
export const normalizeGrade = (raw: string): string | null => {
    const g = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!g) return null;
    if (g === 'TK' || g === 'TRANSITIONALKINDERGARTEN') return 'TK';
    if (g === 'K' || g === 'KINDER' || g === 'KINDERGARTEN') return 'K';

    const match = g.match(/^0*([1-9][0-9]*)(ST|ND|RD|TH)?$/);
    const value = match ? match[1] : null;
    return value && GRADES.includes(value) ? value : null;
};

/** Splits `"Jane Q. Doe"` into first / last for files with one combined name column. */
const splitFullName = (full: string): { firstName: string; lastName: string } => {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

export interface RosterParseOptions {
    /** Students already on the roster. Rows whose ELOP or ASES ID matches one are skipped. */
    existing?: Pick<Student, 'elopId' | 'asesId'>[];
}

/**
 * Parses a roster CSV into Student records.
 *
 * Required columns: a first name, a last name, a grade, and at least one of
 * ELOP ID / ASES ID. Guardian columns are optional — rows without one import
 * successfully and are reported via `missingGuardianCount` so staff can fill
 * the contact in afterwards.
 *
 * Identity: every non-empty ELOP ID and every non-empty ASES ID must be unique
 * on its own — across the file and against `options.existing`. A row that
 * reuses either ID is skipped (never merged), so re-importing the same file is
 * a no-op rather than a second copy of the roster.
 *
 * Throws RosterCsvError when the file itself is unusable. Per-row problems are
 * collected in `errors` and those rows are skipped.
 */
export const parseRosterCsv = (text: string, options: RosterParseOptions = {}): RosterParseResult => {
    if (!text.trim()) {
        throw new RosterCsvError('The CSV file is empty.');
    }

    const rows = parseDelimited(text).filter(row => row.some(cell => cell.trim() !== ''));
    if (rows.length === 0) {
        throw new RosterCsvError('The CSV file is empty.');
    }
    if (rows.length === 1) {
        throw new RosterCsvError('The CSV has a header row but no student rows.');
    }

    const headers = rows[0].map(normalizeHeader);
    const columns = {} as Partial<Record<RosterField, number>>;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [RosterField, string[]][]) {
        for (const alias of aliases) {
            const index = headers.indexOf(alias);
            if (index !== -1) { columns[field] = index; break; }
        }
    }

    const missingColumns: string[] = [];
    if (columns.firstName === undefined) missingColumns.push('first_name');
    if (columns.lastName === undefined) missingColumns.push('last_name');
    if (columns.grade === undefined) missingColumns.push('grade');
    if (columns.elopId === undefined && columns.asesId === undefined) missingColumns.push('elop_id or ases_id');
    if (missingColumns.length > 0) {
        throw new RosterCsvError(
            `CSV is missing required column(s): ${missingColumns.join(', ')}. ` +
            `Found: ${headers.filter(Boolean).join(', ') || 'none'}.`,
        );
    }

    const cell = (row: string[], field: RosterField): string => {
        const index = columns[field];
        return index === undefined ? '' : (row[index] ?? '').trim();
    };

    // Seed with the current roster so re-imports and overlaps are caught.
    const existingElop = new Set<string>();
    const existingAses = new Set<string>();
    for (const s of options.existing ?? []) {
        if (normalizeId(s.elopId)) existingElop.add(normalizeId(s.elopId));
        if (normalizeId(s.asesId)) existingAses.add(normalizeId(s.asesId));
    }
    const seenElop = new Map<string, number>(); // id → row that first used it
    const seenAses = new Map<string, number>();

    const students: Student[] = [];
    const errors: RosterRowError[] = [];
    let missingGuardianCount = 0;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rowNumber = r + 1; // header is row 1 in a spreadsheet

        const firstName = cell(row, 'firstName');
        const lastName = cell(row, 'lastName');
        const gradeRaw = cell(row, 'grade');
        const elopId = cell(row, 'elopId');
        const asesId = cell(row, 'asesId');
        const elopKey = normalizeId(elopId);
        const asesKey = normalizeId(asesId);

        if (!firstName || !lastName) {
            errors.push({ row: rowNumber, message: 'Missing first or last name.' });
            continue;
        }

        const grade = normalizeGrade(gradeRaw);
        if (!grade) {
            errors.push({
                row: rowNumber,
                message: `Unrecognized grade "${gradeRaw}" (expected one of ${GRADES.join(', ')}).`,
            });
            continue;
        }

        if (!elopKey && !asesKey) {
            errors.push({ row: rowNumber, message: 'Row has neither an ELOP ID nor an ASES ID.' });
            continue;
        }

        if (elopKey && existingElop.has(elopKey)) {
            errors.push({ row: rowNumber, message: `ELOP ID ${elopId} is already on the roster — row skipped.` });
            continue;
        }
        if (asesKey && existingAses.has(asesKey)) {
            errors.push({ row: rowNumber, message: `ASES ID ${asesId} is already on the roster — row skipped.` });
            continue;
        }
        if (elopKey && seenElop.has(elopKey)) {
            errors.push({ row: rowNumber, message: `ELOP ID ${elopId} also appears on row ${seenElop.get(elopKey)} — row skipped.` });
            continue;
        }
        if (asesKey && seenAses.has(asesKey)) {
            errors.push({ row: rowNumber, message: `ASES ID ${asesId} also appears on row ${seenAses.get(asesKey)} — row skipped.` });
            continue;
        }
        if (elopKey) seenElop.set(elopKey, rowNumber);
        if (asesKey) seenAses.set(asesKey, rowNumber);

        const programs: SubProgram[] = [];
        if (elopId) programs.push('ELOP');
        if (asesId) programs.push('ASES');

        // Guardian: prefer explicit first/last columns, fall back to a combined
        // `parent_name` column (which is what the Supabase students table exports).
        let guardianFirst = cell(row, 'guardianFirstName');
        let guardianLast = cell(row, 'guardianLastName');
        if (!guardianFirst && !guardianLast) {
            const split = splitFullName(cell(row, 'guardianName'));
            guardianFirst = split.firstName;
            guardianLast = split.lastName;
        }
        const guardianPhone = cell(row, 'guardianPhone');
        const guardianEmail = cell(row, 'guardianEmail');

        const guardians: GuardianContact[] = [];
        if (guardianFirst || guardianLast || guardianPhone || guardianEmail) {
            guardians.push({
                type: 'Contact 1',
                firstName: guardianFirst,
                lastName: guardianLast,
                phone: guardianPhone,
                email: guardianEmail || undefined,
            });
        } else {
            missingGuardianCount++;
        }

        // No yearbookPhotoUrl: an avatar URL seeded with the student's name would
        // send that name to a third-party image host on every render.
        students.push({
            id: uuidv4(),
            firstName,
            lastName,
            grade,
            elopId,
            asesId: asesId || undefined,
            guardians,
            programs,
            sunriseStatus: 'absent',
            sunsetStatus: 'absent',
            hasSnack: false,
            behavior: 'none',
            behaviorIssues: [],
            headInjury: false,
            headInjuryLogs: [],
        });
    }

    return { students, errors, missingGuardianCount };
};

/**
 * Serializes rows to RFC 4180 CSV for export.
 *
 * Cells that a spreadsheet would evaluate as a formula (leading = + - @, tab or
 * CR) are prefixed with an apostrophe, so a student or guardian name imported
 * as `=HYPERLINK(...)` cannot execute when the export is opened in Excel/Sheets.
 */
export const serializeCsv = (rows: (string | number | undefined | null)[][]): string =>
    rows.map(row => row.map(value => {
        let s = value === undefined || value === null ? '' : String(value);
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
