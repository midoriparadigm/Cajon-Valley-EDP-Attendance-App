// src/components/ReleaseFormParts.tsx — Pieces shared by the parent's and the staff's Early Release Form screens
import React, { useEffect, useRef, useState } from 'react';
import type { ReleaseSignature, ReleaseWeekday } from '../types';
import { RELEASE_WEEKDAYS, type ReleaseFormText } from '../utils/releaseFormText';
import { formatReleaseDate, isSignaturePath, rowInputProblem, type ReleaseRowInput } from '../utils/releaseForms';
import { uuidv4 } from '../utils/helpers';

const SCRIPT_FONT = '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive';

// ── Signatures ───────────────────────────────────────────────────────────────

/** A signature as it was made: typed in script, drawn, initials, or a note that it is on paper. */
export const SignatureMark = ({ signature, height = 40 }: { signature: Pick<ReleaseSignature, 'kind' | 'signature' | 'signerName' | 'paperSignedOn'>; height?: number }) => {
    if (signature.kind === 'drawn') {
        return isSignaturePath(signature.signature) ? (
            <svg viewBox="0 0 300 100" role="img" aria-label={`Drawn signature of ${signature.signerName}`} style={{ height, width: height * 3, display: 'block' }}>
                <path d={signature.signature} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ) : <span>(drawn signature)</span>;
    }
    if (signature.kind === 'paper') {
        return <span style={{ fontSize: '13px', fontStyle: 'italic' }}>Signed on paper{signature.paperSignedOn ? `, ${formatReleaseDate(signature.paperSignedOn)}` : ''}</span>;
    }
    if (signature.kind === 'initials') {
        return <span style={{ fontFamily: SCRIPT_FONT, fontSize: `${Math.round(height * 0.6)}px`, lineHeight: 1 }}>{signature.signature}</span>;
    }
    return <span style={{ fontFamily: SCRIPT_FONT, fontSize: `${Math.round(height * 0.65)}px`, lineHeight: 1.1 }}>{signature.signature}</span>;
};

/** The typed-signature preview on the parent's page. */
export const TypedSignaturePreview = ({ name }: { name: string }) => (
    <span style={{ fontFamily: SCRIPT_FONT, fontSize: '30px', lineHeight: 1.2 }}>{name}</span>
);

/**
 * Finger or mouse signature pad. Strokes are kept in a 300 × 100 box whatever
 * the screen size and reported as SVG path data ("M10,20 L30,40 …"), which is
 * what gets stored. An empty string means nothing is drawn.
 */
export const SignaturePad = ({ onChange, hint, clearLabel }: { onChange: (path: string) => void; hint: string; clearLabel: string }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<[number, number][][]>([]);
    const drawing = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);

    const redraw = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const { width, height } = canvas.getBoundingClientRect();
        if (canvas.width !== Math.round(width * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
        ctx.setTransform(canvas.width / 300, 0, 0, canvas.height / 100, 0, 0);
        ctx.clearRect(0, 0, 300, 100);
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = getComputedStyle(canvas).color;
        strokes.current.forEach(stroke => {
            ctx.beginPath();
            stroke.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            // A tap with no movement still leaves a dot.
            if (stroke.length === 1) ctx.lineTo(stroke[0][0] + 0.1, stroke[0][1]);
            ctx.stroke();
        });
    };

    useEffect(() => {
        redraw();
        window.addEventListener('resize', redraw);
        return () => window.removeEventListener('resize', redraw);
    }, []);

    const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
        const r = e.currentTarget.getBoundingClientRect();
        const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)) * 10) / 10;
        return [clamp(((e.clientX - r.left) / r.width) * 300, 300), clamp(((e.clientY - r.top) / r.height) * 100, 100)];
    };

    const report = () => {
        const path = strokes.current.map(s => s.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')).join(' ');
        setIsEmpty(path === '');
        onChange(path);
    };

    return (
        <div>
            <div style={{ position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    aria-label={hint}
                    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; strokes.current.push([point(e)]); redraw(); }}
                    onPointerMove={e => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(point(e)); redraw(); }}
                    onPointerUp={() => { if (!drawing.current) return; drawing.current = false; report(); }}
                    onPointerCancel={() => { if (!drawing.current) return; drawing.current = false; report(); }}
                    style={{ width: '100%', height: '150px', display: 'block', borderRadius: '12px', border: '1.5px dashed var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', touchAction: 'none', cursor: 'crosshair' }}
                />
                {isEmpty && <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px', pointerEvents: 'none' }}>{hint}</span>}
            </div>
            <button type="button" onClick={() => { strokes.current = []; redraw(); report(); }} disabled={isEmpty} style={{ marginTop: '8px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px', fontWeight: 600, cursor: isEmpty ? 'default' : 'pointer', opacity: isEmpty ? 0.5 : 1 }}>{clearLabel}</button>
        </div>
    );
};

// ── Date ranges ──────────────────────────────────────────────────────────────

/** One date range while somebody is filling it in. */
export interface RowDraft {
    key: string;
    dateFrom: string;
    dateTo: string;
    reasonCode: number | '';
    /** One time for every chosen day (the usual case), or a time per day. */
    sameTime: boolean;
    time: string;
    days: Record<ReleaseWeekday, boolean>;
    perDay: Partial<Record<ReleaseWeekday, string>>;
    /** The signed date range this one replaces. */
    supersedes?: string;
}

const allDays = (on: boolean) => Object.fromEntries(RELEASE_WEEKDAYS.map(d => [d, on])) as Record<ReleaseWeekday, boolean>;

/** A blank date range, or a copy of a signed one to change. */
export const newRowDraft = (from?: { id: string; dateFrom: string; dateTo: string; reasonCode: number; times: Partial<Record<ReleaseWeekday, string>> }): RowDraft => {
    if (!from) return { key: uuidv4(), dateFrom: '', dateTo: '', reasonCode: '', sameTime: true, time: '', days: allDays(true), perDay: {} };
    const given = RELEASE_WEEKDAYS.filter(d => from.times[d]);
    const first = given.length > 0 ? from.times[given[0]]! : '';
    const same = given.every(d => from.times[d] === first);
    return {
        key: uuidv4(), dateFrom: from.dateFrom, dateTo: from.dateTo, reasonCode: from.reasonCode, sameTime: same, time: same ? first : '',
        days: Object.fromEntries(RELEASE_WEEKDAYS.map(d => [d, !!from.times[d]])) as Record<ReleaseWeekday, boolean>,
        perDay: { ...from.times }, supersedes: from.id,
    };
};

export const draftToInput = (d: RowDraft): ReleaseRowInput => {
    const times: ReleaseRowInput['times'] = {};
    RELEASE_WEEKDAYS.forEach(day => {
        if (d.sameTime) { if (d.days[day]) times[day] = d.time; }
        else if (d.perDay[day]) times[day] = d.perDay[day];
    });
    return { dateFrom: d.dateFrom, dateTo: d.dateTo, reasonCode: d.reasonCode === '' ? 0 : d.reasonCode, times, supersedes: d.supersedes };
};

export const draftProblem = (d: RowDraft) => rowInputProblem(draftToInput(d));

const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)',
    color: 'var(--text-main)', fontSize: '16px', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: '46px',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' };

interface RowsEditorProps {
    drafts: RowDraft[];
    onChange: (drafts: RowDraft[]) => void;
    text: ReleaseFormText;
    /** Show what is wrong with each date range (after a first try at submitting). */
    showProblems: boolean;
    /** Numbering starts after any date ranges already on the form. */
    startAt?: number;
}

/** The form's "Authorization for Early Release" table, as one card per date range. */
export const ReleaseRowsEditor = ({ drafts, onChange, text, showProblems, startAt = 1 }: RowsEditorProps) => {
    const ui = text.ui;
    const update = (key: string, patch: Partial<RowDraft>) => onChange(drafts.map(d => (d.key === key ? { ...d, ...patch } : d)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {drafts.map((d, i) => {
                const problem = showProblems ? draftProblem(d) : null;
                return (
                    <fieldset key={d.key} style={{ margin: 0, padding: '16px', borderRadius: '14px', border: `1.5px solid ${problem ? 'var(--color-danger)' : 'var(--border-subtle)'}`, backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
                        <legend style={{ padding: '0 6px', fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }}>{ui.dateRange(startAt + i)}</legend>
                        {d.supersedes && <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '10px' }}>{ui.replaces}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                            <label><span style={labelStyle}>{ui.from}</span><input type="date" value={d.dateFrom} onChange={e => update(d.key, { dateFrom: e.target.value })} style={fieldStyle} /></label>
                            <label><span style={labelStyle}>{ui.to}</span><input type="date" value={d.dateTo} min={d.dateFrom || undefined} onChange={e => update(d.key, { dateTo: e.target.value })} style={fieldStyle} /></label>
                        </div>
                        <label style={{ display: 'block', marginBottom: '12px' }}>
                            <span style={labelStyle}>{ui.reason}</span>
                            <select value={d.reasonCode} onChange={e => update(d.key, { reasonCode: e.target.value === '' ? '' : Number(e.target.value) })} style={fieldStyle}>
                                <option value="">{ui.chooseReason}</option>
                                {Object.entries(text.reasons).map(([code, label]) => <option key={code} value={code}>{code}. {label}</option>)}
                            </select>
                        </label>

                        {d.sameTime ? (
                            <>
                                <label style={{ display: 'block', marginBottom: '12px' }}>
                                    <span style={labelStyle}>{ui.releaseTime}</span>
                                    <input type="time" value={d.time} onChange={e => update(d.key, { time: e.target.value })} style={fieldStyle} />
                                </label>
                                <div role="group" aria-label={ui.onDays}>
                                    <span style={labelStyle}>{ui.onDays}</span>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {RELEASE_WEEKDAYS.map(day => (
                                            <button key={day} type="button" aria-pressed={d.days[day]} onClick={() => update(d.key, { days: { ...d.days, [day]: !d.days[day] } })} style={{ flex: '1 0 auto', padding: '10px 8px', borderRadius: '10px', border: d.days[day] ? '1.5px solid var(--color-primary)' : '1px solid var(--border-subtle)', backgroundColor: d.days[day] ? 'var(--color-primary)' : 'var(--bg-input)', color: d.days[day] ? '#fff' : 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                                {text.weekdays[day].slice(0, 3)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {RELEASE_WEEKDAYS.map(day => (
                                    <label key={day} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{text.weekdays[day]}</span>
                                        <input type="time" aria-label={`${text.weekdays[day]}: ${ui.releaseTime}`} value={d.perDay[day] ?? ''} onChange={e => update(d.key, { perDay: { ...d.perDay, [day]: e.target.value || undefined } })} style={fieldStyle} />
                                    </label>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => update(d.key, d.sameTime
                                ? { sameTime: false, perDay: Object.fromEntries(RELEASE_WEEKDAYS.filter(day => d.days[day] && d.time).map(day => [day, d.time])) }
                                : { sameTime: true })} style={{ padding: 0, border: 'none', background: 'none', color: 'var(--color-primary-hover)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                                {d.sameTime ? ui.differentTimes : ui.sameTime}
                            </button>
                            <button type="button" onClick={() => onChange(drafts.filter(x => x.key !== d.key))} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{ui.removeRange}</button>
                        </div>
                        {problem && <div role="alert" style={{ marginTop: '10px', fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>{ui.errors[problem]}</div>}
                    </fieldset>
                );
            })}
            <button type="button" onClick={() => onChange([...drafts, newRowDraft()])} style={{ padding: '12px', borderRadius: '12px', border: '1.5px dashed var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-main)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>add</span>{ui.addRange}
            </button>
        </div>
    );
};
