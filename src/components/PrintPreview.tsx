// src/components/PrintPreview.tsx — The full-screen print preview every printout uses
//
// White Letter-size sheets on a dark backdrop, scaled to fit the screen, with
// Print and Close. When printing, only the sheets print: the app behind is
// hidden and each sheet starts a new page. The print dialog can also save a
// PDF. Sheets are always black on white, whatever the app's theme.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Letter width at 96 px per inch. */
const SHEET_PX = 816;
const fitScale = () => Math.min(1, (window.innerWidth - 32) / SHEET_PX);

interface PrintPreviewProps {
    /** The page title while open: the print dialog's header, and a saved PDF's name and title. */
    documentTitle: string;
    /** First toolbar line, e.g. "Print preview · 2 forms". */
    label: string;
    /** Page margins, e.g. "0.4in 0.5in". Sheets use the same padding on screen. */
    margin: string;
    /** Rules added inside @page, such as running footers (Chrome prints them; some browsers ignore them). */
    pageRules?: string;
    /** Styles for what is on the sheets. */
    css: string;
    onClose: () => void;
    /** The sheets: <Sheet> elements. */
    children: React.ReactNode;
}

/** One printed page (or more, if its content runs over). */
export const Sheet = ({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) => (
    <section className={`pp-sheet${className ? ` ${className}` : ''}`} aria-label={label}>{children}</section>
);

const PrintPreview = ({ documentTitle, label, margin, pageRules = '', css, onClose, children }: PrintPreviewProps) => {
    const [scale, setScale] = useState(fitScale);
    const printButton = useRef<HTMLButtonElement>(null);
    const close = useRef(onClose);
    close.current = onClose;

    useEffect(() => {
        const previousTitle = document.title;
        document.title = documentTitle;
        printButton.current?.focus();
        const onResize = () => setScale(fitScale());
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation(); // close only the preview, not the screen underneath
            close.current();
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKey, true);
        return () => {
            document.title = previousTitle;
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [documentTitle]);

    return createPortal(
        <div className="pp-root" role="dialog" aria-modal="true" aria-label="Print preview" lang="en">
            <style>{shellCss(margin, pageRules)}{css}</style>
            <div className="pp-toolbar">
                <div className="pp-toolbar-title">
                    <div>{label}</div>
                    <div className="pp-toolbar-hint">To keep a PDF, choose “Save as PDF” in the print dialog.</div>
                </div>
                <button ref={printButton} type="button" className="pp-btn pp-btn-primary" onClick={() => window.print()}>
                    <span className="material-icons-round" aria-hidden="true">print</span>Print
                </button>
                <button type="button" className="pp-btn" onClick={onClose}>Close</button>
            </div>
            <div className="pp-scroll">
                <div className="pp-pages" style={{ zoom: scale }}>{children}</div>
            </div>
        </div>,
        document.body,
    );
};

export default PrintPreview;

const shellCss = (margin: string, pageRules: string) => `
.pp-root { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; background: #525659; }
.pp-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px; background: #1f2937; color: #fff; }
.pp-toolbar-title { flex: 1 1 120px; min-width: 0; font-size: 14px; font-weight: 700; }
.pp-toolbar-hint { font-size: 12px; font-weight: 500; opacity: 0.8; }
.pp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.35); background: transparent; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.pp-btn .material-icons-round { font-size: 18px; }
.pp-btn-primary { background: #3b82f6; border-color: #3b82f6; }
.pp-scroll { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; }
.pp-pages { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 16px 48px; }
.pp-sheet { box-sizing: border-box; width: 8.5in; min-height: 11in; padding: ${margin}; background: #fff; color: #000; box-shadow: 0 4px 18px rgba(0,0,0,0.4);
  font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 12pt; line-height: 1.3; text-align: left; }
.pp-sheet h1, .pp-sheet h2, .pp-sheet h3, .pp-sheet h4 { color: #000; font-weight: 700; break-after: avoid; page-break-after: avoid; }
.pp-sheet p { margin: 0 0 6pt; }
.pp-sheet abbr { text-decoration: none; }

@page { size: letter; margin: ${margin}; ${pageRules} }
@media print {
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
  body > :not(.pp-root) { display: none !important; }
  .pp-root { position: static !important; display: block !important; background: #fff !important; }
  .pp-toolbar { display: none !important; }
  .pp-scroll { overflow: visible !important; }
  .pp-pages { display: block !important; padding: 0 !important; zoom: 1 !important; }
  .pp-sheet { width: auto !important; min-height: 0 !important; padding: 0 !important; box-shadow: none !important; }
  .pp-sheet + .pp-sheet { break-before: page; page-break-before: always; }
}
`;
