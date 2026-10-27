// src/components/HeadInjuryIcon.tsx — Head Injury Report icon (no Material icon fits), shared by the student tiles and summary
const HeadInjuryIcon = ({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2C8.5 2 6 4.5 6 7.5C6 8.5 6 10 6 11C5 11.5 4 12.5 4 14C4 16 5.5 17 6 17L6.5 21C6.5 21.5 7 22 7.5 22H12" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M12 2C13.5 2 15 2.8 16 4C17 5.2 17.5 6.5 17.5 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <circle cx="16.5" cy="6" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1.2" />
        <line x1="16" y1="1.5" x2="15.5" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18.5" y1="2.5" x2="17.5" y2="3.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="20" y1="5" x2="18.5" y2="5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="10" r="0.8" fill={color} />
        <path d="M8 14C8 14 9 15 10.5 14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);

export default HeadInjuryIcon;
