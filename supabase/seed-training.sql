-- seed-training.sql
-- Sample training modules for Build Alpha Kids

-- 1. Welcome Video (onboarding, mandatory)
INSERT INTO training_modules (title, description, type, category, content_json, estimated_minutes, is_mandatory, status)
VALUES (
  'Welcome to Build Alpha Kids',
  'An introduction to our mission, values, and what it means to be a Build Alpha Kids coach.',
  'video',
  'onboarding',
  '{
    "video_url": "https://www.youtube.com/watch?v=placeholder",
    "video_type": "youtube",
    "duration_seconds": 600,
    "require_full_watch": true
  }',
  10,
  true,
  'draft'
);

-- 2. Child Safety Policy (compliance, mandatory)
INSERT INTO training_modules (title, description, type, category, content_json, estimated_minutes, is_mandatory, status)
VALUES (
  'Child Safety Policy',
  'Essential child safety policies and procedures. All coaches must read and acknowledge this document.',
  'document',
  'compliance',
  '{
    "file_url": "",
    "file_name": "BAK_Child_Safety_Policy.pdf",
    "file_type": "pdf",
    "require_acknowledgement": true
  }',
  15,
  true,
  'draft'
);

-- 3. Session Delivery Standards (onboarding, mandatory, checklist)
INSERT INTO training_modules (title, description, type, category, content_json, estimated_minutes, is_mandatory, status)
VALUES (
  'Session Delivery Standards',
  'A checklist of standards every coach must follow when delivering a session at any centre.',
  'checklist',
  'onboarding',
  '{
    "items": [
      {"id": "c1", "title": "Arrive 10 minutes early", "description": "Set up equipment and greet centre staff before the session starts.", "requires_note": false},
      {"id": "c2", "title": "Complete attendance", "description": "Mark all children present or absent using the app before starting activities.", "requires_note": false},
      {"id": "c3", "title": "Run warm-up activity", "description": "Conduct a 5-minute warm-up suitable for the age group.", "requires_note": false},
      {"id": "c4", "title": "Deliver skill development", "description": "Follow the program plan for the main skill development component.", "requires_note": false},
      {"id": "c5", "title": "Include game or match play", "description": "End with a fun game that reinforces the skills taught.", "requires_note": false},
      {"id": "c6", "title": "Run cool-down", "description": "Conduct a brief cool-down and gather children for dismissal.", "requires_note": false},
      {"id": "c7", "title": "Pack down equipment", "description": "Return all equipment to the kit bag and report any issues.", "requires_note": true},
      {"id": "c8", "title": "Submit session report", "description": "Complete the post-session form and end the session in the app.", "requires_note": false}
    ]
  }',
  20,
  true,
  'draft'
);

-- 4. Child Safety Awareness Quiz (compliance, mandatory)
INSERT INTO training_modules (title, description, type, category, content_json, estimated_minutes, is_mandatory, status)
VALUES (
  'Child Safety Awareness',
  'Test your understanding of child safety procedures and mandatory reporting obligations.',
  'quiz',
  'compliance',
  '{
    "pass_mark": 80,
    "allow_retries": true,
    "max_retries": 3,
    "randomise_order": true,
    "questions": [
      {"id": "q1", "question": "What is the minimum age at which a Working With Children Check (WWCC) is required in NSW?", "options": ["16 years", "18 years", "21 years", "No minimum age"], "correct_answer_index": 1, "explanation": "In NSW, a WWCC is required for anyone 18 years or older who works or volunteers in child-related work."},
      {"id": "q2", "question": "When should you report a child safety concern?", "options": ["Only when you are certain abuse has occurred", "When you have reasonable grounds to suspect risk", "Only if the child tells you directly", "Only if another coach also noticed"], "correct_answer_index": 1, "explanation": "You must report when you have reasonable grounds to suspect a child is at risk, even without certainty."},
      {"id": "q3", "question": "Who is a mandatory reporter in NSW?", "options": ["Only teachers", "Only police officers", "Anyone who works with children in a professional capacity", "Only social workers"], "correct_answer_index": 2, "explanation": "In NSW, mandatory reporters include anyone who works with children in their professional role."},
      {"id": "q4", "question": "What should you do if a child discloses abuse to you?", "options": ["Investigate the claim yourself", "Listen carefully, reassure the child, and report", "Tell the child to report to the police", "Keep it confidential as promised"], "correct_answer_index": 1, "explanation": "Listen supportively, reassure the child it is not their fault, and follow your reporting obligations."},
      {"id": "q5", "question": "Is it appropriate to be alone with a child in an enclosed space?", "options": ["Yes, if you are their coach", "Yes, if you have a WWCC", "No, always maintain visibility", "Only during sessions"], "correct_answer_index": 2, "explanation": "Always maintain visibility. Avoid being alone with a child in enclosed or unobservable spaces."},
      {"id": "q6", "question": "What is the first step in our incident reporting process?", "options": ["Call the police", "Ensure the child is safe and not in immediate danger", "Contact the centre director", "Fill out the incident form"], "correct_answer_index": 1, "explanation": "The first priority is always ensuring the child''s immediate safety before taking any other steps."},
      {"id": "q7", "question": "How should physical contact during coaching be managed?", "options": ["Avoid all physical contact", "Only appropriate contact related to the sport, with the child''s consent", "Physical contact is fine during warm-ups", "Only when parents are present"], "correct_answer_index": 1, "explanation": "Physical contact should only be sport-related, appropriate, and with the child''s understanding and consent."},
      {"id": "q8", "question": "Which of these is a sign of potential neglect?", "options": ["A child who is very talkative", "A child consistently wearing dirty or ill-fitting clothes", "A child who prefers to play alone", "A child who asks lots of questions"], "correct_answer_index": 1, "explanation": "Consistently dirty or ill-fitting clothing can be an indicator of neglect, among other signs."},
      {"id": "q9", "question": "Where should session photos be stored?", "options": ["On your personal phone", "On the Build Alpha Kids app/platform only", "On social media", "On any cloud service"], "correct_answer_index": 1, "explanation": "All photos of children must be stored securely on the Build Alpha Kids platform, not on personal devices or social media."},
      {"id": "q10", "question": "What should you do if you notice another coach behaving inappropriately with a child?", "options": ["Discuss it with the coach first", "Ignore it if it seems minor", "Report it immediately to your supervisor", "Wait to see if it happens again"], "correct_answer_index": 2, "explanation": "Report any inappropriate behaviour immediately. Do not confront the individual or wait for it to recur."}
    ]
  }',
  15,
  true,
  'draft'
);
