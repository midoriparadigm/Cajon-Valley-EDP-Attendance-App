// src/utils/sms.ts — SMS utility functions for EDP Attendance App

/**
 * Mock SMS sending function for development/testing
 * Simulates async network delay and returns success response
 */
export const sendSmsMock = async (
    phone: string,
    templateType: 'pickup_notification' | 'auth_request' | 'checkin_notification' | 'checkin_correction',
    data: any
): Promise<{ success: boolean; mock: boolean; message: string }> => {
    let message = "";

    if (templateType === 'pickup_notification') {
        const { guardian_name, school_name, time, date, student_names } = data;
        // Sent at each check-out, which is always one student.
        message = `${student_names} was picked up by ${guardian_name} from ${school_name} at ${time} on ${date}.`;
    } else if (templateType === 'auth_request') {
        const { guardian_name, role_type, student_names } = data;
        message = `Do you authorize ${guardian_name} to be the ${role_type} Guardian who is allowed to pick up ${student_names}?`;
    } else if (templateType === 'checkin_notification') {
        const { student_name, student_names, time, program, staff_name } = data;
        message = program
            ? `[${program}] ${student_name || student_names} has arrived and is checked in at ${time}.`
            : `${student_names} has been checked in by ${staff_name} at ${time}.`;
    } else if (templateType === 'checkin_correction') {
        // Sent when a Lead undoes a check-in whose arrival text already went out.
        const { student_name, time, program } = data;
        message = `[${program}] Please disregard our earlier text: ${student_name}'s ${time} check-in was entered by mistake and has been removed.`;
    }

    // Dev-only log — redacted to avoid PII (phone/message) appearing in production console
    if (import.meta.env.DEV) {
        console.log(`[SMS Mock] type=${templateType} | phone=***REDACTED***`);
    }


    // Simulate async network delay
    return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true, mock: true, message }), 500);
    });
};
