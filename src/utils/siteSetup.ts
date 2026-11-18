// src/utils/siteSetup.ts — The school name a Lead sets once, under Leader Dashboard → Early Release Forms
import { isSupabaseConfigured } from '../supabaseClient';

/** This device's saved setup: school name, program cycle and program hours. */
export const SITE_SETUP_KEY = 'edp-release-setup';

/** The school name for printed reports: the one set on the Early Release Forms screen, or a default. */
export const siteNameForPrint = (): string => {
    try {
        const saved = JSON.parse(localStorage.getItem(SITE_SETUP_KEY) ?? 'null');
        if (typeof saved?.siteName === 'string' && saved.siteName.trim()) return saved.siteName.trim();
    } catch { /* storage unavailable */ }
    return isSupabaseConfigured ? 'Cajon Valley EDP' : 'Sample Elementary School';
};
