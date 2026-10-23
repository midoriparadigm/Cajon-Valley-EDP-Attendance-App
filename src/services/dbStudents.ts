// src/services/dbStudents.ts — Which students on the board are real database rows
//
// Only these are written to Supabase. Sample students and students added or
// imported in this session (not yet saved to the database) stay on this
// device. This used to be guessed from the id's shape (uuid = database), so
// CSV-imported students — which get uuids but were never inserted — were
// "saved" by updates that matched no row, and reported as success.

const ids = new Set<string>();

/** Replaces the set with the roster just loaded from the database. */
export const setDbStudents = (list: string[]) => {
    ids.clear();
    list.forEach(id => ids.add(id));
};

export const addDbStudent = (id: string) => { ids.add(id); };
export const removeDbStudent = (id: string) => { ids.delete(id); };
export const isDbStudent = (id: string): boolean => ids.has(id);
export const clearDbStudents = () => { ids.clear(); };
