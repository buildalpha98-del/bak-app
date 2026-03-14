import type { FormField } from "@/lib/types/database";

// Form type labels
export const FORM_TYPE_LABELS: Record<string, string> = {
  attendance: "Attendance",
  incident: "Incident / Injury Report",
  session_feedback: "Session Feedback",
  risk_assessment: "Risk Assessment",
  compliance: "Compliance Upload",
};

export const FORM_TYPES = [
  "attendance",
  "incident",
  "session_feedback",
  "risk_assessment",
  "compliance",
] as const;

// ============================================================
// Default Template Definitions
// ============================================================

function lockedFields(): FormField[] {
  return [
    {
      id: "locked_session_id",
      type: "text",
      label: "Session ID",
      required: false,
      locked: true,
      autoPopulate: "session_id",
    },
    {
      id: "locked_coach_name",
      type: "text",
      label: "Coach Name",
      required: false,
      locked: true,
      autoPopulate: "coach_name",
    },
    {
      id: "locked_date_time",
      type: "text",
      label: "Date & Time",
      required: false,
      locked: true,
      autoPopulate: "date_time",
    },
    {
      id: "locked_centre_name",
      type: "text",
      label: "Centre Name",
      required: false,
      locked: true,
      autoPopulate: "centre_name",
    },
  ];
}

export const DEFAULT_TEMPLATES: Record<string, { name: string; formType: string; fields: FormField[] }> = {
  attendance: {
    name: "Attendance",
    formType: "attendance",
    fields: [
      ...lockedFields(),
      {
        id: "headcount",
        type: "number",
        label: "Headcount",
        required: true,
        placeholder: "Number of participants",
      },
      {
        id: "notes",
        type: "textarea",
        label: "Notes",
        required: false,
        placeholder: "Any additional notes...",
      },
    ],
  },
  incident: {
    name: "Incident / Injury Report",
    formType: "incident",
    fields: [
      ...lockedFields(),
      {
        id: "child_name",
        type: "text",
        label: "Child Name",
        required: true,
        placeholder: "Full name of the child",
      },
      {
        id: "description",
        type: "textarea",
        label: "Description of Incident",
        required: true,
        placeholder: "Describe what happened...",
        helpText: "Include time, location, and what occurred",
      },
      {
        id: "action_taken",
        type: "textarea",
        label: "Action Taken",
        required: true,
        placeholder: "What actions were taken...",
      },
      {
        id: "witnesses",
        type: "text",
        label: "Witnesses",
        required: false,
        placeholder: "Names of any witnesses",
      },
      {
        id: "severity",
        type: "select",
        label: "Severity",
        required: true,
        options: ["Minor", "Moderate", "Serious"],
      },
      {
        id: "photos",
        type: "file",
        label: "Photos",
        required: false,
        helpText: "Attach up to 3 photos if applicable",
        maxFiles: 3,
      },
      {
        id: "parent_notified",
        type: "checkbox",
        label: "Parent / Guardian Notified",
        required: false,
      },
      {
        id: "centre_staff_notified",
        type: "checkbox",
        label: "Centre Staff Notified",
        required: false,
      },
    ],
  },
  session_feedback: {
    name: "Session Feedback",
    formType: "session_feedback",
    fields: [
      ...lockedFields(),
      {
        id: "activities_delivered",
        type: "textarea",
        label: "Activities Delivered",
        required: true,
        placeholder: "Describe the activities delivered during this session...",
      },
      {
        id: "engagement_level",
        type: "rating",
        label: "Engagement Level",
        required: true,
        helpText: "Rate participant engagement from 1 (low) to 5 (high)",
      },
      {
        id: "observations",
        type: "textarea",
        label: "Observations",
        required: false,
        placeholder: "Any notable observations...",
      },
    ],
  },
  risk_assessment: {
    name: "Risk Assessment",
    formType: "risk_assessment",
    fields: [
      ...lockedFields(),
      {
        id: "site_name",
        type: "text",
        label: "Site Name",
        required: true,
        locked: true,
        autoPopulate: "centre_name",
      },
      {
        id: "hazards_identified",
        type: "textarea",
        label: "Hazards Identified",
        required: true,
        placeholder: "List any hazards observed at the site...",
      },
      {
        id: "controls_in_place",
        type: "textarea",
        label: "Controls in Place",
        required: true,
        placeholder: "What controls are in place to mitigate these hazards...",
      },
      {
        id: "risk_rating",
        type: "select",
        label: "Risk Rating",
        required: true,
        options: ["Low", "Medium", "High"],
      },
      {
        id: "ra_photos",
        type: "file",
        label: "Photos",
        required: false,
        helpText: "Attach photos of hazards or site conditions",
        maxFiles: 3,
      },
      {
        id: "assessor_name",
        type: "text",
        label: "Assessor Name",
        required: true,
        locked: true,
        autoPopulate: "coach_name",
      },
    ],
  },
  compliance: {
    name: "Compliance Upload",
    formType: "compliance",
    fields: [
      ...lockedFields().slice(0, 2), // Only session ID and coach name
      {
        id: "document_type",
        type: "select",
        label: "Document Type",
        required: true,
        options: [
          "WWCC",
          "First Aid Certificate",
          "Police Check",
          "Insurance",
          "Coaching Certification",
          "Code of Conduct",
          "Other",
        ],
      },
      {
        id: "id_number",
        type: "text",
        label: "ID / Certificate Number",
        required: false,
        placeholder: "e.g. WWC1234567",
      },
      {
        id: "expiry_date",
        type: "date",
        label: "Expiry Date",
        required: false,
      },
      {
        id: "document_upload",
        type: "file",
        label: "Document Upload",
        required: true,
        helpText: "Upload a photo or scan of the document",
        maxFiles: 1,
      },
    ],
  },
};
