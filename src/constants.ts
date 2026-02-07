// src/constants.ts — All shared constants for EDP Attendance App

export const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

// Behavior Checklists based on Tiered District Safety Plan
export const BEHAVIOR_CHECKLISTS = {
    green: [
        "Classroom or campus disruption",
        "Hands-on",
        "Tardiness, absences",
        "Dress code violation",
        "Viewing inappropriate content online",
        "Lying, cheating, or plagiarism",
        "Defiance of staff directions",
        "Physical aggression",
        "Gum",
        "Public displays of affection",
        "Inappropriate language",
        "Unauthorized usage of cell phone",
        "Other"
    ]
};

export const BEHAVIOR_ROLE_DESCRIPTIONS = {
    green: "EDP Staff/Para/Coach.\n• Redirect/Correct Behavior.\n• Student Reflection.\n• Behavior Ticket if needed."
};

export const HEAD_INJURY_SYMPTOMS = {
    cognitive: [
        "Difficulty thinking clearly",
        "Difficulty remembering events",
        "Difficulty concentrating",
        "Feeling more slowed down",
        "Feeling sluggish, hazy, foggy"
    ],
    observed: [
        "Appears dazed or stunned",
        "Is confused about events",
        "Repeats questions",
        "Answers questions slowly",
        "Can't recall events prior",
        "Can't recall events after",
        "Loses consciousness",
        "Shows behavior changes",
        "Forgets class schedule"
    ],
    physical: [
        "Headache or pressure",
        "Nausea or vomiting",
        "Balance problems or dizziness",
        "Fatigue or feeling tired",
        "Blurry or double vision",
        "Sensitivity to light",
        "Sensitivity to noise",
        "Numbness or tingling",
        "Does not 'feel right'"
    ],
    emotional: [
        "Irritable",
        "Sad",
        "More emotional than usual",
        "Nervous"
    ]
};
