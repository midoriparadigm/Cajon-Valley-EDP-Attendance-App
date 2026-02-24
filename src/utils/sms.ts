// src/utils/sms.ts — SMS utility functions for EDP Attendance App

/**
 * Mock SMS sending function for development/testing
 * Simulates async network delay and returns success response
 */
export const sendSmsMock = async (
    phone: string,
    templateType: 'pickup_notification' | 'auth_request' | 'checkin_notification',
    data: any
): Promise<{ success: boolean; mock: boolean; message: string }> => {
    let message = "";

    if (templateType === 'pickup_notification') {
        const { guardian_name, school_name, time, date, student_names } = data;
        message = `The following student(s) has/have been picked up by ${guardian_name} from ${school_name} at ${time} on ${date}: ${student_names}`;
    } else if (templateType === 'auth_request') {
        const { guardian_name, role_type, student_names } = data;
        message = `Do you authorize ${guardian_name} to be the ${role_type} Guardian who is allowed to pickup ${student_names}?`;
    } else if (templateType === 'checkin_notification') {
        const { student_name, student_names, time, program, staff_name } = data;
        message = program
            ? `[${program}] ${student_name || student_names} has arrived and is checked in at ${time}.`
            : `${student_names} has been checked in by ${staff_name} at ${time}.`;
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
