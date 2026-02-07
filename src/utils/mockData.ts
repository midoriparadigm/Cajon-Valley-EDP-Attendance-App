// src/utils/mockData.ts — Mock data for development/testing
import type { Staff, Student, GuardianContact } from '../types';

// =============================================================================
// MOCK STAFF
// =============================================================================

export const MOCK_LEAD_USER: Staff = {
    id: 's1',
    name: 'Veronica Thomas',
    role: 'Lead',
    organization: 'EDP',
    email: 'thomasv@cajonvalley.net',
    canCheckIn: true,
    canAdminTasks: true,
    canCheckOut: true,
    canHir: true,
    hasPasskey: true,
    assignedGrades: ['TK', 'K', '1', '2', '3', '4', '5']
};

export const MOCK_COACH_USER: Staff = {
    id: 's2',
    name: 'Coach Mike',
    role: 'Coach',
    organization: '549 Sports',
    email: 'mike@549sports.com',
    canCheckIn: true,
    canAdminTasks: false,
    canCheckOut: false,
    canHir: false,
    assignedGrades: ['1', '2', '3', '4', '5'] // Limited grades example
};

export const INITIAL_STAFF: Staff[] = [MOCK_LEAD_USER, MOCK_COACH_USER];

// =============================================================================
// MOCK STUDENTS GENERATOR
// =============================================================================

export const GENERATE_MOCK_STUDENTS = (): Student[] => {
    const NAMES_MALE = {
        American: ['Liam', 'Noah', 'James', 'William', 'Logan', 'Mason', 'Elijah', 'Oliver', 'Jacob', 'Lucas'],
        Hispanic: ['Mateo', 'Santiago', 'Sebastian', 'Leonardo', 'Diego', 'Daniel', 'Julian', 'Alexander', 'Angel', 'David'],
        Arabic: ['Muhammad', 'Ahmed', 'Ali', 'Omar', 'Youssef', 'Ibrahim', 'Adam', 'Amir', 'Hamza', 'Khalid'],
        Chaldean: ['Yousif', 'Fadi', 'Rami', 'George', 'Dani', 'Michael', 'Joseph', 'Thomas', 'Peter', 'Simon']
    };
    const NAMES_FEMALE = {
        American: ['Emma', 'Olivia', 'Ava', 'Isabella', 'Mia', 'Sophia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn'],
        Hispanic: ['Sofia', 'Camila', 'Valentina', 'Isabella', 'Victoria', 'Gabriela', 'Mariana', 'Lucia', 'Elena', 'Natalia'],
        Arabic: ['Maryam', 'Fatima', 'Aisha', 'Zainab', 'Layla', 'Noor', 'Hana', 'Salma', 'Jana', 'Sarah'],
        Chaldean: ['Rita', 'Noura', 'Lina', 'Sarah', 'Dalia', 'Mary', 'Anne', 'Monica', 'Rachel', 'Jessica']
    };

    const PARENT_NAMES_MALE = {
        American: ['Robert', 'John', 'Michael', 'David', 'Richard', 'Joseph', 'Charles', 'Thomas'],
        Hispanic: ['Carlos', 'Juan', 'Luis', 'Jose', 'Miguel', 'Francisco', 'Antonio', 'Jorge'],
        Arabic: ['Hassan', 'Hussein', 'Mahmoud', 'Mustafa', 'Abdullah', 'Saleh', 'Tarek', 'Samir'],
        Chaldean: ['Nabil', 'Sam', 'Aziz', 'Salam', 'Waleed', 'Raad', 'Sabah', 'Hikmat']
    };

    const PARENT_NAMES_FEMALE = {
        American: ['Jennifer', 'Maria', 'Susan', 'Lisa', 'Karen', 'Nancy', 'Linda', 'Betty'],
        Hispanic: ['Maria', 'Ana', 'Rosa', 'Carmen', 'Teresa', 'Juana', 'Martha', 'Patricia'],
        Arabic: ['Amal', 'Samira', 'Nadia', 'Mona', 'Laila', 'Huda', 'Rania', 'Sherin'],
        Chaldean: ['Suham', 'Amira', 'Nidal', 'Basma', 'Wafa', 'Janan', 'Hanaa', 'Nawal']
    };

    const LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Martinez', 'Ali', 'Khan', 'Yako', 'Hannosh', 'Rodriguez', 'Wilson'];

    const grades = ['TK', 'K', '1', '2', '3', '4', '5'];
    let students: Student[] = [];
    let idCounter = 1;

    grades.forEach(grade => {
        const count = 15 + Math.floor(Math.random() * 6); // 15-20 students
        for (let i = 0; i < count; i++) {
            const ethnicities = ['American', 'Hispanic', 'Arabic', 'Chaldean'] as const;
            const ethnicity = ethnicities[Math.floor(Math.random() * ethnicities.length)];

            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const firstNameList = gender === 'male' ? NAMES_MALE[ethnicity] : NAMES_FEMALE[ethnicity];
            const firstName = firstNameList[Math.floor(Math.random() * firstNameList.length)];
            const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

            const parentGender = Math.random() > 0.5 ? 'male' : 'female';
            const parentNameList = parentGender === 'male' ? PARENT_NAMES_MALE[ethnicity] : PARENT_NAMES_FEMALE[ethnicity];
            const guardianFirstName = parentNameList[Math.floor(Math.random() * parentNameList.length)];

            const hasAses = Math.random() > 0.5;
            students.push({
                id: String(idCounter),
                elopId: String(1000 + idCounter),
                asesId: hasAses ? `A${1000 + idCounter}` : undefined,
                firstName,
                lastName,
                grade: grade as any,
                guardians: [{
                    type: 'Contact 1',
                    firstName: guardianFirstName,
                    lastName,
                    phone: `619-555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
                    relationship: parentGender === 'male' ? 'Father' : 'Mother'
                }],
                programs: hasAses ? ['ELOP', 'ASES'] : ['ELOP'],
                sunriseStatus: 'absent',
                sunsetStatus: 'absent',
                hasSnack: false,
                behavior: 'none',
                behaviorIssues: [],
                headInjury: false,
                headInjuryLogs: [],
                yearbookPhotoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}&gender=${gender}`
            });
            idCounter++;
        }
    });
    return students;
};

export const INITIAL_STUDENTS: Student[] = GENERATE_MOCK_STUDENTS();
