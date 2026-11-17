// src/utils/releaseFormText.ts — Wording of the Early Release Form
//
// Transcribed from CVUSD EDP's paper "2026-2027 Elementary School Early Release
// Form" (Rev. 02/05/2026), so the electronic form carries the same parts. The
// version shown is stored with every form and the language with every
// signature, so a later change in wording never changes what somebody signed.
//
// The Spanish text is a working translation for the demo; the district needs
// to review it (and add other home languages) before families see it.
//
// Two lines of the paper form say "ASES Summer program" on a school-year form.
// They are reproduced as printed until the EDP office confirms the wording.

import type { ReleaseLanguage, ReleaseWeekday } from '../types';

export const RELEASE_FORM_VERSION = 'Rev. 02/05/2026';

/** Printed on the paper form; each site can change it when starting forms. */
export const DEFAULT_PROGRAM_HOURS = 'Mon. 1:00-6:00 pm & Tue.-Fri. 2:00 pm-6:00 pm';

/** Days a link stays usable. */
export const RELEASE_LINK_DAYS = 14;

export const RELEASE_WEEKDAYS: ReleaseWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const RELEASE_LANGUAGES: { id: ReleaseLanguage; label: string }[] = [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Español' },
];

/** The form's eight numbered reasons, in English (used on staff screens and exports). */
export const RELEASE_REASONS: Record<number, string> = {
    1: 'Parallel Program',
    2: 'Family Emergencies',
    3: 'Family Needs',
    4: 'Medical Appointments',
    5: 'Weather Conditions',
    6: 'Medical Emergencies',
    7: 'Other Conditions',
    8: 'Transportation',
};

export interface ReleaseFormText {
    title: string;
    policyHeading: string;
    policy: string;
    studentsHeading: string;
    students: string;
    reasonsHeading: string;
    reasons: Record<number, string>;
    authorizationHeading: string;
    agreementHeading: string;
    agreementSubheading: string;
    agreement: string;
    /** What the signer ticks before signing electronically. */
    consent: string;
    weekdays: Record<ReleaseWeekday, string>;
    /** Everything else on the guardian's screen. */
    ui: {
        school: string; programHours: string; student: string; grade: string; cycle: string;
        readFirst: string; yourDates: string;
        fullProgram: string; fullProgramHelp: string; needsEarly: string;
        dateRange: (n: number) => string; from: string; to: string; reason: string; chooseReason: string;
        releaseTime: string; onDays: string; differentTimes: string; sameTime: string; noEarlyRelease: string;
        addRange: string; removeRange: string; change: string; replaces: string;
        alreadySigned: string; signedOn: (when: string) => string;
        signHeading: string; yourName: string; typeTab: string; drawTab: string; drawHere: string; clear: string;
        typedPreview: string; submit: string; submitting: string;
        doneHeading: string; done: (when: string) => string; doneNext: string;
        errors: { dates: string; order: string; reason: string; time: string; days: string; name: string; draw: string; consent: string; nothing: string; failed: string };
        link: { loading: string; notFound: string; used: string; expired: string; replaced: string; error: string; contact: string };
        expires: (when: string) => string;
    };
}

const en: ReleaseFormText = {
    title: '2026-2027 Elementary School Early Release Form',
    policyHeading: 'Attendance and Early Release Policy',
    policy: 'In accordance with the California Education Code Section 8483(a)(1)(2)(3), the following attendance and early release regulations for the After School Education and Safety Program (ASES) are required. Also, a periodic review of attendance will be conducted to ensure priority enrollment is given to students who attend daily.',
    studentsHeading: 'Elementary School Students',
    students: 'It is the intent of the California Legislature that elementary school students participate in the full hours of the program on the days that they participate. If an elementary school student is unable to attend the full hours of the program, the parent/guardian must complete and submit for approval a request for early release specifying the days and hours the pupil will attend and the reason(s) for requesting early release. First priority shall go to pupils who are identified by the program as homeless youth, as defined by the federal McKinney-Vento Homeless Assistance Act (42 U.S.C. Sec 11434a), at the time that they apply for enrollment or at any time during the school year, and to pupils who are identified by the program as being in foster care and to pupils who are eligible for free or reduced-priced meals. Second priority for enrollment will be given to students who can attend the full hours every day. Non-compliance with the attendance and early release policy may result in disenrollment from the ASES Summer program.',
    reasonsHeading: 'Reason(s) for Requesting Early Release',
    reasons: RELEASE_REASONS,
    authorizationHeading: 'Authorization for Early Release',
    agreementHeading: 'ASES Early Release Authorization Agreement',
    agreementSubheading: 'ASES Summer Program Authorization for Early Release (continued)',
    agreement: 'By signing below, I am acknowledging the intent of the California Legislature and the California Education Code; I attest that the Early Release authorization information is true to the best of my knowledge, and I am aware of potential consequences associated with non-compliance of the ASES attendance and Early Release requirements. I further acknowledge that I have received the parent handbook & registration materials.',
    consent: 'I agree to sign this form electronically. My typed or drawn signature has the same effect as signing on paper.',
    weekdays: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' },
    ui: {
        school: 'School', programHours: 'Program hours', student: 'Student', grade: 'Grade', cycle: 'Program cycle',
        readFirst: 'Please read the policy, then tell us about any early release your child needs.',
        yourDates: 'Does your child need to leave early?',
        fullProgram: 'No. My child will stay for the full program every day.',
        fullProgramHelp: 'You will still sign the agreement below.',
        needsEarly: 'Yes. My child needs to leave early on some days.',
        dateRange: n => `Date range ${n}`, from: 'From', to: 'To', reason: 'Reason', chooseReason: 'Choose a reason',
        releaseTime: 'Release time', onDays: 'On these days', differentTimes: 'Use different times on different days', sameTime: 'Use one time for every day',
        noEarlyRelease: 'No early release',
        addRange: 'Add another date range', removeRange: 'Remove', change: 'Change these dates', replaces: 'Replaces the dates you signed earlier',
        alreadySigned: 'Already on this form', signedOn: when => `Signed ${when}`,
        signHeading: 'Sign', yourName: 'Your full name', typeTab: 'Type', drawTab: 'Draw', drawHere: 'Sign with your finger here', clear: 'Clear',
        typedPreview: 'Your signature', submit: 'Sign and submit', submitting: 'Sending…',
        doneHeading: 'Thank you. Your form is signed.', done: when => `Signed ${when}.`,
        doneNext: 'EDP staff will review it and add their signature. You can close this page.',
        errors: {
            dates: 'Enter both dates.', order: 'The end date is before the start date.', reason: 'Choose a reason.',
            time: 'Enter a release time.', days: 'Choose at least one day.', name: 'Enter your full name.',
            draw: 'Draw your signature, or switch to typing it.', consent: 'Tick the box to sign electronically.',
            nothing: 'Add at least one date range.', failed: 'Your form could not be sent. Please try again.',
        },
        link: {
            loading: 'Opening your form…',
            notFound: 'This link is not valid.',
            used: 'This form has already been signed with this link.',
            expired: 'This link has expired.',
            replaced: 'A newer link was sent for this form. Please use the most recent message.',
            error: 'The form could not be opened. Check your connection and try again.',
            contact: 'Ask your EDP site lead to send a new link.',
        },
        expires: when => `This link works once and expires ${when}.`,
    },
};

const es: ReleaseFormText = {
    title: 'Formulario de Salida Temprana de Escuela Primaria 2026-2027',
    policyHeading: 'Política de asistencia y salida temprana',
    policy: 'De acuerdo con la Sección 8483(a)(1)(2)(3) del Código de Educación de California, se requieren las siguientes normas de asistencia y salida temprana para el Programa de Educación y Seguridad Después de Clases (ASES). Además, se hará una revisión periódica de la asistencia para asegurar que se dé prioridad de inscripción a los estudiantes que asisten todos los días.',
    studentsHeading: 'Estudiantes de escuela primaria',
    students: 'La Legislatura de California tiene la intención de que los estudiantes de escuela primaria participen durante todo el horario del programa los días en que asistan. Si un estudiante de primaria no puede asistir durante todo el horario del programa, el padre, la madre o el tutor debe completar y presentar para su aprobación una solicitud de salida temprana que indique los días y las horas en que asistirá el estudiante y el motivo o los motivos de la solicitud. Se dará primera prioridad a los estudiantes que el programa identifique como jóvenes sin hogar, según la definición de la Ley federal McKinney-Vento de Asistencia a Personas sin Hogar (42 U.S.C. Sec 11434a), en el momento en que soliciten la inscripción o en cualquier momento durante el año escolar, a los estudiantes que el programa identifique como menores en cuidado de crianza temporal y a los estudiantes que reúnan los requisitos para recibir comidas gratuitas o a precio reducido. Se dará segunda prioridad de inscripción a los estudiantes que puedan asistir todo el horario todos los días. No cumplir con la política de asistencia y salida temprana puede resultar en la baja del programa de verano ASES.',
    reasonsHeading: 'Motivo(s) para solicitar la salida temprana',
    reasons: {
        1: 'Programa paralelo',
        2: 'Emergencias familiares',
        3: 'Necesidades familiares',
        4: 'Citas médicas',
        5: 'Condiciones del clima',
        6: 'Emergencias médicas',
        7: 'Otras condiciones',
        8: 'Transporte',
    },
    authorizationHeading: 'Autorización de salida temprana',
    agreementHeading: 'Acuerdo de autorización de salida temprana de ASES',
    agreementSubheading: 'Autorización de salida temprana del Programa de Verano ASES (continuación)',
    agreement: 'Al firmar a continuación, reconozco la intención de la Legislatura de California y del Código de Educación de California; doy fe de que la información de la autorización de salida temprana es verdadera a mi leal saber y entender, y estoy al tanto de las posibles consecuencias de no cumplir con los requisitos de asistencia y salida temprana de ASES. También reconozco que recibí el manual para padres y los materiales de inscripción.',
    consent: 'Acepto firmar este formulario electrónicamente. Mi firma escrita o dibujada tiene el mismo efecto que firmar en papel.',
    weekdays: { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes' },
    ui: {
        school: 'Escuela', programHours: 'Horario del programa', student: 'Estudiante', grade: 'Grado', cycle: 'Ciclo del programa',
        readFirst: 'Lea la política y luego díganos si su hijo o hija necesita salir temprano.',
        yourDates: '¿Su hijo o hija necesita salir temprano?',
        fullProgram: 'No. Mi hijo o hija se quedará todo el programa todos los días.',
        fullProgramHelp: 'De todos modos firmará el acuerdo que aparece abajo.',
        needsEarly: 'Sí. Mi hijo o hija necesita salir temprano algunos días.',
        dateRange: n => `Fechas ${n}`, from: 'Desde', to: 'Hasta', reason: 'Motivo', chooseReason: 'Elija un motivo',
        releaseTime: 'Hora de salida', onDays: 'En estos días', differentTimes: 'Usar horas distintas según el día', sameTime: 'Usar una sola hora para todos los días',
        noEarlyRelease: 'Sin salida temprana',
        addRange: 'Agregar otras fechas', removeRange: 'Quitar', change: 'Cambiar estas fechas', replaces: 'Reemplaza las fechas que firmó antes',
        alreadySigned: 'Ya está en este formulario', signedOn: when => `Firmado ${when}`,
        signHeading: 'Firmar', yourName: 'Su nombre completo', typeTab: 'Escribir', drawTab: 'Dibujar', drawHere: 'Firme aquí con el dedo', clear: 'Borrar',
        typedPreview: 'Su firma', submit: 'Firmar y enviar', submitting: 'Enviando…',
        doneHeading: 'Gracias. Su formulario está firmado.', done: when => `Firmado ${when}.`,
        doneNext: 'El personal de EDP lo revisará y agregará su firma. Ya puede cerrar esta página.',
        errors: {
            dates: 'Escriba las dos fechas.', order: 'La fecha final es anterior a la fecha inicial.', reason: 'Elija un motivo.',
            time: 'Escriba una hora de salida.', days: 'Elija al menos un día.', name: 'Escriba su nombre completo.',
            draw: 'Dibuje su firma o cambie a escribirla.', consent: 'Marque la casilla para firmar electrónicamente.',
            nothing: 'Agregue al menos un rango de fechas.', failed: 'No se pudo enviar su formulario. Inténtelo de nuevo.',
        },
        link: {
            loading: 'Abriendo su formulario…',
            notFound: 'Este enlace no es válido.',
            used: 'Este formulario ya se firmó con este enlace.',
            expired: 'Este enlace ya venció.',
            replaced: 'Se envió un enlace más reciente para este formulario. Use el mensaje más reciente.',
            error: 'No se pudo abrir el formulario. Revise su conexión e inténtelo de nuevo.',
            contact: 'Pida al encargado de EDP de su escuela que le envíe un enlace nuevo.',
        },
        expires: when => `Este enlace funciona una sola vez y vence el ${when}.`,
    },
};

export const RELEASE_FORM_TEXT: Record<ReleaseLanguage, ReleaseFormText> = { en, es };
