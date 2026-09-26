import type { BlueprintInput } from "../schema";

/**
 * HR demo: a new-hire onboarding desk for a hospital group, shared by HR and IT.
 * Procurement (Coupa) starts "missing" on purpose: laptop orders queue up
 * for IT until it's connected, while accounts can already be approved and created.
 */
export const hrBrief =
  "A new-hire onboarding desk for Brightline Health: build each new hire's onboarding plan, provision their accounts and laptop, and track compliance training, with IT approving anything that creates an account.";

export const hrFixture: BlueprintInput = {
  version: 1,
  meta: {
    name: "New Hire Onboarding",
    tagline: "Every new hire ready on day one: plan, accounts, laptop and training.",
    vertical: "hr",
    plain:
      "A desk shared by Brightline Health's HR and IT teams. When someone accepts an offer, one agent builds their onboarding plan from Workday, a second prepares their accounts and orders their laptop (with IT approving anything that creates an account or spends money) and a third makes sure every new hire finishes the compliance training they need before they see patients.",
    theme: { primary: "#7C3AED", radius: "lg", density: "comfortable", mode: "light" },
    auth: { enabled: true, providers: ["sso"] },
    region: "us",
  },
  screens: [
    {
      id: "new-hires",
      slug: "new-hires",
      title: "New Hires",
      icon: "user-plus",
      purpose: "See everyone starting soon and whether they'll be ready on day one.",
      plain:
        "The screen HR opens each morning. It lists everyone who has accepted an offer, where they'll work, when they start, and how far along their onboarding is, so nobody turns up to a hospital without a badge, a login or their training done.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "hire-kpis",
            items: [
              { label: "Starting in next 14 days", value: "11", delta: "+3 vs. last fortnight", tone: "neutral" },
              { label: "Ready for day one", value: "7 of 11", tone: "good" },
              { label: "Waiting on IT approval", value: "6", tone: "neutral" },
              { label: "Not cleared for patient care", value: "2", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "hire-table",
            title: "Upcoming starters",
            entityId: "hire",
            columns: ["name", "role", "department", "site", "start_date", "manager", "stage"],
            filters: ["stage", "department", "site"],
            rowAction: { kind: "navigate", screenId: "onboarding-plan" },
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "hire-chat",
            agentId: "onboarding-planner",
            title: "Ask Onboarding Planner",
            placeholder: "Ask about upcoming starters…",
            starters: [
              "Who isn't on track for day one?",
              "Summarise next week's starters by site",
              "Which plans are marked 'Tight timeline'?",
            ],
          },
        ],
      },
    },
    {
      id: "onboarding-plan",
      slug: "plan",
      title: "Onboarding Plan",
      icon: "calendar-check",
      purpose: "One new hire's plan: what's done, what's next, and who owns each step.",
      plain:
        "Opens when someone clicks a new hire. Shows their role, site and start date, every step of their onboarding from paperwork to their 30-day check-in, and who is responsible for each one.",
      layout: "split",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "detail",
            id: "plan-detail-card",
            title: "New hire",
            entityId: "hire",
            fields: ["name", "role", "department", "site", "manager", "start_date", "employment", "patient_facing", "stage", "hris_id"],
            actions: [
              {
                label: "Rebuild plan",
                variant: "secondary",
                action: { kind: "agent", agentId: "onboarding-planner", prompt: "Rebuild the onboarding plan for this new hire from Workday." },
              },
              {
                label: "Start IT provisioning",
                variant: "primary",
                action: { kind: "agent", agentId: "it-provisioner", prompt: "Prepare the accounts and laptop this new hire needs for their role." },
              },
            ],
          },
          {
            type: "timeline",
            id: "plan-timeline",
            title: "Onboarding plan",
            items: [
              { title: "Offer accepted in Workday", when: "Sep 22", state: "done" },
              { title: "Plan built · RN, Emergency, St. Anne's", when: "Sep 22", state: "done" },
              { title: "Okta and Microsoft 365 created · approved by IT", when: "Sep 24", state: "done" },
              { title: "Epic (RN) and Pyxis access · waiting for IT", when: "In progress", state: "active" },
              { title: "Laptop · Dell Latitude 7450 ordered", when: "Due Oct 1", state: "active" },
              { title: "HIPAA, Bloodborne Pathogens, Fire & Life Safety", when: "Due Oct 2", state: "pending" },
              { title: "Day one · badge photo and St. Anne's site tour", when: "Oct 6, 07:30", state: "pending" },
              { title: "30-day check-in with Janet Ruiz", when: "Nov 5", state: "pending" },
            ],
          },
        ],
        side: [
          {
            type: "list",
            id: "plan-tasks",
            title: "Tasks",
            entityId: "task",
            titleField: "task",
            subtitleField: "owner",
            badgeField: "status",
          },
          {
            type: "chat",
            id: "plan-chat",
            agentId: "onboarding-planner",
            title: "Onboarding Planner",
            placeholder: "Ask about this plan…",
            starters: ["What's still blocking day one?", "Move her site tour to Tuesday"],
          },
        ],
      },
    },
    {
      id: "it-provisioning",
      slug: "it",
      title: "IT Provisioning",
      icon: "laptop",
      purpose: "Approve the accounts and equipment prepared for each new hire.",
      plain:
        "Every account and laptop IT Provisioner prepares waits here. No account is created and nothing is ordered until someone in IT presses Approve. Anything unusual (access outside the role, or an expensive laptop) is flagged.",
      layout: "single",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "it-kpis",
            items: [
              { label: "Awaiting IT approval", value: "6", tone: "neutral" },
              { label: "Accounts created this week", value: "14", delta: "+5", tone: "good" },
              { label: "Laptops on order", value: "5" },
              { label: "At risk for day one", value: "2", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "it-table",
            title: "Provisioning requests",
            entityId: "it-request",
            columns: ["request_no", "hire", "item", "type", "system", "cost", "status"],
            filters: ["status", "type"],
            pageSize: 8,
          },
          {
            type: "actions",
            id: "it-actions",
            buttons: [
              { label: "Approve selected", variant: "primary", action: { kind: "toast", message: "Approved. IT Provisioner will create 3 accounts and post in #it-onboarding." } },
              { label: "Reject", variant: "danger", action: { kind: "toast", message: "Rejected. The hiring manager has been told why." } },
              {
                label: "Check day-one readiness",
                variant: "secondary",
                action: { kind: "agent", agentId: "it-provisioner", prompt: "Which hires starting in the next 7 days aren't fully provisioned?" },
              },
            ],
          },
        ],
        side: [
          {
            type: "chat",
            id: "it-chat",
            agentId: "it-provisioner",
            title: "Ask IT Provisioner",
            placeholder: "Ask about a request…",
            starters: ["Why does this nurse need Pyxis?", "Which laptop orders are stuck?"],
          },
        ],
      },
    },
    {
      id: "compliance",
      slug: "compliance",
      title: "Compliance",
      icon: "shield-check",
      purpose: "Track required training and see who isn't cleared to work with patients.",
      plain:
        "Every Brightline employee must finish certain training: clinical staff before their first shift with patients. This screen shows each new hire's courses, what's overdue, and who has been reminded.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "compliance-kpis",
            items: [
              { label: "Finished before day one", value: "91%", delta: "+6 pts vs. Q2", tone: "good" },
              { label: "Overdue courses", value: "4", tone: "bad" },
              { label: "Due this week", value: "12", tone: "neutral" },
              { label: "Clinical hires cleared", value: "9 of 11", tone: "neutral" },
            ],
          },
          {
            type: "table",
            id: "training-table",
            title: "Required training",
            entityId: "training",
            columns: ["hire", "course", "category", "due", "progress", "status", "reminders_sent"],
            filters: ["status", "category"],
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "compliance-chat",
            agentId: "compliance-tracker",
            title: "Ask Compliance Tracker",
            placeholder: "Ask about training…",
            starters: ["Who isn't cleared for patient care yet?", "What's overdue at St. Anne's?"],
          },
          {
            type: "text",
            id: "compliance-note",
            title: "Cleared for patient care",
            markdown:
              "A clinical hire is **cleared** only when **HIPAA Privacy & Security**, **Bloodborne Pathogens** and **Fire & Life Safety** are all complete in HealthStream. Compliance Tracker tells their manager 48 hours before the first shift if they aren't.",
          },
        ],
      },
    },
    {
      id: "welcome",
      slug: "welcome",
      title: "Welcome Form",
      icon: "clipboard-list",
      purpose: "A short form new hires fill in before their first day.",
      plain:
        "Sent to every new hire the day they accept their offer. It collects the practical details HR and IT need (preferred name, badge photo, scrub size, emergency contact) so day one is about meeting the team, not paperwork.",
      layout: "form",
      audience: "customer",
      status: "planned",
      regions: {
        main: [
          {
            type: "form",
            id: "welcome-form",
            title: "Welcome to Brightline Health",
            entityId: "hire",
            fields: [
              { name: "preferred_name", label: "What should we call you?", kind: "text", required: true },
              { name: "pronouns", label: "Pronouns", kind: "select", options: ["she/her", "he/him", "they/them", "Prefer not to say"] },
              { name: "mobile", label: "Mobile number", kind: "text", required: true },
              { name: "emergency_contact", label: "Emergency contact (name and phone)", kind: "text", required: true },
              { name: "scrub_size", label: "Scrub size (clinical roles)", kind: "select", options: ["XS", "S", "M", "L", "XL", "XXL"] },
              { name: "badge_photo", label: "Photo for your ID badge", kind: "file", required: true },
              { name: "parking", label: "Do you need a parking permit?", kind: "toggle" },
              { name: "accessibility", label: "Anything that would make your first week easier?", kind: "textarea" },
            ],
            submitLabel: "Send to HR",
            onSubmit: { kind: "toast", message: "Thank you. HR has your details. Your first-day schedule will arrive by email." },
          },
        ],
        side: [
          {
            type: "text",
            id: "welcome-help",
            title: "What happens next",
            markdown:
              "1. Your manager and HR build your first-week plan.\n2. IT sets up your sign-in and equipment. Details arrive a few days before you start.\n3. You'll get links to any required training, with plenty of time to finish it.",
          },
        ],
      },
    },
  ],
  agents: [
    {
      id: "onboarding-planner",
      name: "Onboarding Planner",
      role: "Builds each new hire's onboarding plan",
      avatarHue: 268,
      plain:
        "When someone accepts an offer in Workday, it builds their onboarding plan: paperwork, what IT needs to set up, the training they must finish, and who meets them on day one and where. It tailors the plan to the role and site: a night-shift nurse at St. Anne's gets a different first week from a finance analyst at the main campus.",
      jobDescription:
        "You are the Onboarding Planner for Brightline Health's HR team. When a new hire appears in Workday with status 'Offer accepted', read their role, department, site, manager, employment type and start date. Build an onboarding plan from the matching role template with four parts: pre-start tasks (background check confirmation, I-9, badge photo), IT requests (accounts and equipment for the role), required compliance training with due dates, and a first-week schedule with named owners. Clinical hires must have HIPAA Privacy & Security, Bloodborne Pathogens and Fire & Life Safety due at least 2 days before their first patient-facing shift. Every task needs an owner and a due date. If the start date is fewer than 5 working days away, mark the plan 'Tight timeline' and tell HR what can't be finished in time. Only ever change the onboarding plan in Workday.",
      rules: [
        "Every task has an owner and a due date.",
        "Clinical hires: HIPAA, Bloodborne Pathogens and Fire & Life Safety are due 2 days before the first shift.",
        "Mark start dates under 5 working days away as 'Tight timeline'.",
        "Only change the onboarding plan in Workday, never pay, job or personal data.",
        "Never put salary or background-check results in a plan.",
      ],
      tools: [
        { id: "read_hris", name: "Read Workday", description: "Read a new hire's role, site, manager, employment type and start date.", connectionId: "workday", access: "read", permission: "auto" },
        { id: "create_plan", name: "Create plan", description: "Create or update the onboarding plan and its tasks in Workday.", connectionId: "workday", access: "write", permission: "log" },
      ],
      supervision: "spot_check",
      knowledge: [
        { label: "Role onboarding templates", source: "document", ref: "role-templates-2026.xlsx" },
        { label: "Site orientation guide", source: "document", ref: "site-orientation.pdf" },
        { label: "New hires", source: "entity", ref: "hire" },
      ],
      memory: { scope: "project", retentionDays: 120 },
      cost: { creditsPerRun: 2, model: "claude-opus-5" },
      triggers: ["on_create", "chat"],
      rehearsals: [
        { id: "r-clinical-hire", name: "Clinical hire", input: "Registered Nurse, Emergency, St. Anne's, full-time, starts Oct 6.", expect: "Plan includes Epic and Pyxis access; HIPAA, Bloodborne and Fire due by Oct 2; site tour on day one; every task has an owner.", history: [] },
        { id: "r-tight-timeline", name: "Tight timeline", input: "Financial analyst accepted on Thursday, starts Monday.", expect: "Plan marked 'Tight timeline'; HR told the laptop may not arrive in time.", history: [] },
        { id: "r-contractor", name: "Contractor", input: "IT help desk contractor for 3 months at the main campus.", expect: "No benefits enrolment tasks; accounts requested with an end date matching the contract.", history: [] },
      ],
      framework: "lyzr",
      origin: "generated",
    },
    {
      id: "it-provisioner",
      name: "IT Provisioner",
      role: "Prepares accounts and laptops for IT to approve",
      avatarHue: 212,
      plain:
        "Takes the IT part of each onboarding plan and prepares it: the right sign-ins for the role (email, Epic, medication cabinets) and a laptop from the approved list. It can't create an account or place an order until someone in IT approves, and it posts every request in #it-onboarding so nothing slips.",
      jobDescription:
        "You are the IT Provisioner for Brightline Health. For each onboarding plan, prepare the IT requests the role needs using the role access matrix: an Okta account and Microsoft 365 for everyone; Epic with the role's security class for clinical staff; Pyxis for nurses and pharmacists; VPN only for remote or on-call roles. Choose the standard laptop for the role from the approved catalogue. Write a one-line justification for each request, then ask IT to approve before creating any account or placing any order. Post a summary of each hire's requests in #it-onboarding. Apply least privilege: if the access matrix doesn't list a system for the role, don't request it. Ask the manager to raise an exception. Requests should be ready 5 working days before the start date.",
      rules: [
        "Never create an account or place an order without IT approval.",
        "Least privilege: only request systems the access matrix lists for the role.",
        "Contractor accounts must have an end date.",
        "Laptops only from the approved catalogue; anything over $1,800 also needs the department head.",
        "Have requests ready 5 working days before the start date.",
      ],
      tools: [
        { id: "read_hris", name: "Read Workday", description: "Read the new hire's role, department and start date.", connectionId: "workday", access: "read", permission: "auto" },
        { id: "create_account", name: "Create account", description: "Create the new hire's Okta account and assign role-based app access.", connectionId: "okta", access: "irreversible", permission: "ask" },
        { id: "order_laptop", name: "Order laptop", description: "Place a laptop order from the approved hardware catalogue.", connectionId: "procurement", access: "irreversible", permission: "ask" },
        { id: "notify_it", name: "Post in Slack", description: "Post a summary of a hire's requests in #it-onboarding.", connectionId: "slack", access: "write", permission: "log" },
      ],
      supervision: "approve_all",
      knowledge: [
        { label: "Role access matrix", source: "document", ref: "access-matrix-2026.xlsx" },
        { label: "Approved hardware catalogue", source: "document", ref: "hardware-catalogue-2026.pdf" },
        { label: "IT requests", source: "entity", ref: "it-request" },
      ],
      memory: { scope: "project", retentionDays: 180 },
      cost: { creditsPerRun: 3, model: "claude-opus-5" },
      triggers: ["manual", "on_create", "chat"],
      rehearsals: [
        { id: "r-nurse-access", name: "Nurse accounts", input: "Registered Nurse, Emergency, St. Anne's, starts Oct 6.", expect: "Okta, Microsoft 365, Epic (RN) and Pyxis requested, all waiting for IT approval; one Slack summary posted.", history: [] },
        { id: "r-outside-matrix", name: "Access outside the role", input: "Manager asks for payroll admin access for a new front-desk coordinator.", expect: "Not requested; explains it isn't in the access matrix and asks the manager to raise an exception.", history: [] },
        { id: "r-expensive-laptop", name: "Expensive laptop", input: "Radiology asks for a $2,890 workstation laptop for a new technologist.", expect: "Order prepared and marked 'needs department head' as well as IT approval.", history: [] },
      ],
      framework: "crewai",
      origin: "generated",
    },
    {
      id: "compliance-tracker",
      name: "Compliance Tracker",
      role: "Tracks required training and chases what's overdue",
      avatarHue: 152,
      plain:
        "Keeps an eye on the training every Brightline employee must finish: privacy, fire safety, infection control and role-specific courses. It sends friendly reminders as due dates get close and tells the manager if a clinical hire isn't cleared to see patients before their first shift.",
      jobDescription:
        "You are the Compliance Tracker for Brightline Health. Each morning, check HealthStream for every new hire's assigned courses. Email the new hire a reminder 5 days and 2 days before a course is due, and on the due date. If a course becomes overdue, email the new hire and their manager together. A clinical hire is 'cleared for patient care' only when HIPAA Privacy & Security, Bloodborne Pathogens and Fire & Life Safety are all complete; tell the manager about anyone who isn't cleared 48 hours before their first shift. Keep reminders short, friendly and specific: course name, due date, how long it takes, and the direct link. Never mark a course complete, HealthStream is the source of truth.",
      rules: [
        "Never mark training complete. HealthStream is the source of truth.",
        "At most one reminder per person per day.",
        "Only copy the manager once a course is overdue, or 48 hours before a first shift.",
        "Clinical hires aren't cleared until HIPAA, Bloodborne Pathogens and Fire & Life Safety are complete.",
        "Never mention someone's overdue training in a public channel.",
      ],
      tools: [
        { id: "read_training", name: "Read training", description: "Read each new hire's assigned courses, progress and due dates.", connectionId: "lms", access: "read", permission: "auto" },
        { id: "read_hris", name: "Read Workday", description: "Read the new hire's manager and first shift date.", connectionId: "workday", access: "read", permission: "auto" },
        { id: "send_reminder", name: "Send reminder", description: "Email a training reminder to the new hire (and their manager if overdue).", connectionId: "email", access: "write", permission: "log" },
      ],
      supervision: "autonomous",
      knowledge: [
        { label: "Required training by role", source: "document", ref: "required-training-matrix.pdf" },
        { label: "Training records", source: "entity", ref: "training" },
      ],
      memory: { scope: "org", retentionDays: 365 },
      cost: { creditsPerRun: 1, model: "claude-opus-5" },
      triggers: ["schedule", "chat"],
      rehearsals: [
        { id: "r-due-soon", name: "Due in 2 days", input: "Nurse has HIPAA due Friday, 40% complete, starts Monday.", expect: "One friendly reminder with the course link and time left; manager not copied.", history: [] },
        { id: "r-overdue-clinical", name: "Overdue before first shift", input: "Respiratory therapist's Bloodborne Pathogens is 3 days overdue; first shift is tomorrow.", expect: "Email to the hire and manager; flagged 'not cleared for patient care'.", history: [] },
        { id: "r-already-reminded", name: "Already reminded today", input: "A 3pm check finds someone who was reminded at 9am.", expect: "No second reminder sent today.", history: [] },
      ],
      framework: "langgraph",
      origin: "generated",
    },
  ],
  entities: [
    {
      id: "hire",
      name: "New hire",
      plural: "New hires",
      plain: "Someone who has accepted a job at Brightline Health and hasn't finished onboarding yet.",
      fields: [
        { name: "name", label: "Name", type: "string" },
        { name: "role", label: "Role", type: "string" },
        { name: "department", label: "Department", type: "enum", options: ["Nursing", "Emergency", "Pharmacy", "Radiology", "Finance", "IT", "Facilities"] },
        { name: "site", label: "Site", type: "enum", options: ["Main Campus", "St. Anne's", "Lakeside Clinic", "Riverside Outpatient"] },
        { name: "manager", label: "Manager", type: "string" },
        { name: "start_date", label: "Start date", type: "date" },
        { name: "employment", label: "Employment", type: "enum", options: ["Full-time", "Part-time", "Per diem", "Contractor"] },
        { name: "patient_facing", label: "Patient-facing", type: "boolean" },
        { name: "stage", label: "Stage", type: "enum", options: ["Offer accepted", "Plan ready", "Provisioning", "Training", "Ready for day one", "Started"] },
        { name: "hris_id", label: "Workday ID", type: "string" },
      ],
      sample: [
        { name: "Amara Okonkwo", role: "Registered Nurse", department: "Emergency", site: "St. Anne's", manager: "Janet Ruiz", start_date: "2026-10-06", employment: "Full-time", patient_facing: true, stage: "Provisioning", hris_id: "WD-104882" },
        { name: "Daniel Frost", role: "Financial Analyst", department: "Finance", site: "Main Campus", manager: "Priya Shah", start_date: "2026-09-28", employment: "Full-time", patient_facing: false, stage: "Provisioning", hris_id: "WD-104871" },
        { name: "Marcus Bell", role: "Respiratory Therapist", department: "Emergency", site: "St. Anne's", manager: "Janet Ruiz", start_date: "2026-09-29", employment: "Per diem", patient_facing: true, stage: "Training", hris_id: "WD-104856" },
        { name: "Kwame Asante", role: "Radiologic Technologist", department: "Radiology", site: "Lakeside Clinic", manager: "Maria Lopes", start_date: "2026-10-06", employment: "Part-time", patient_facing: true, stage: "Training", hris_id: "WD-104860" },
        { name: "Sofia Marquez", role: "Clinical Pharmacist", department: "Pharmacy", site: "Main Campus", manager: "Dr. Alan Brooks", start_date: "2026-10-13", employment: "Full-time", patient_facing: true, stage: "Plan ready", hris_id: "WD-104890" },
        { name: "Grace O'Neill", role: "Facilities Technician", department: "Facilities", site: "Riverside Outpatient", manager: "Tom Walsh", start_date: "2026-10-13", employment: "Full-time", patient_facing: false, stage: "Plan ready", hris_id: "WD-104893" },
        { name: "Hannah Lee", role: "Help Desk Analyst (contract)", department: "IT", site: "Main Campus", manager: "Greg Tan", start_date: "2026-10-20", employment: "Contractor", patient_facing: false, stage: "Offer accepted", hris_id: "WD-104901" },
        { name: "Ethan Park", role: "Staff Nurse (nights)", department: "Nursing", site: "Lakeside Clinic", manager: "Linda Carver", start_date: "2026-09-22", employment: "Full-time", patient_facing: true, stage: "Started", hris_id: "WD-104812" },
      ],
    },
    {
      id: "task",
      name: "Onboarding task",
      plural: "Onboarding tasks",
      plain: "One step in a new hire's onboarding plan, with the person responsible and a due date.",
      fields: [
        { name: "task", label: "Task", type: "string" },
        { name: "hire", label: "New hire", type: "string" },
        { name: "owner", label: "Owner", type: "enum", options: ["HR", "IT", "Manager", "New hire"] },
        { name: "phase", label: "When", type: "enum", options: ["Before day one", "Day one", "Week one", "Day 30"] },
        { name: "due", label: "Due", type: "date" },
        { name: "status", label: "Status", type: "enum", options: ["Not started", "In progress", "Done", "Blocked"] },
      ],
      sample: [
        { task: "Confirm background check and I-9", hire: "Amara Okonkwo", owner: "HR", phase: "Before day one", due: "2026-09-29", status: "Done" },
        { task: "Okta, Microsoft 365, Epic (RN) and Pyxis access", hire: "Amara Okonkwo", owner: "IT", phase: "Before day one", due: "2026-09-29", status: "In progress" },
        { task: "Laptop · Dell Latitude 7450", hire: "Amara Okonkwo", owner: "IT", phase: "Before day one", due: "2026-10-01", status: "In progress" },
        { task: "HIPAA Privacy & Security", hire: "Amara Okonkwo", owner: "New hire", phase: "Before day one", due: "2026-10-02", status: "In progress" },
        { task: "Bloodborne Pathogens", hire: "Amara Okonkwo", owner: "New hire", phase: "Before day one", due: "2026-10-02", status: "Not started" },
        { task: "Fire & Life Safety", hire: "Amara Okonkwo", owner: "New hire", phase: "Before day one", due: "2026-10-02", status: "Not started" },
        { task: "Badge photo and St. Anne's site tour", hire: "Amara Okonkwo", owner: "Manager", phase: "Day one", due: "2026-10-06", status: "Not started" },
        { task: "Shadow shift with preceptor", hire: "Amara Okonkwo", owner: "Manager", phase: "Week one", due: "2026-10-08", status: "Not started" },
        { task: "30-day check-in with Janet Ruiz", hire: "Amara Okonkwo", owner: "Manager", phase: "Day 30", due: "2026-11-05", status: "Not started" },
      ],
    },
    {
      id: "it-request",
      name: "IT request",
      plural: "IT requests",
      plain: "An account or piece of equipment prepared for a new hire, waiting for IT to approve it.",
      fields: [
        { name: "request_no", label: "Request #", type: "string" },
        { name: "hire", label: "New hire", type: "string" },
        { name: "item", label: "Item", type: "string" },
        { name: "type", label: "Type", type: "enum", options: ["Account", "Laptop", "Badge access", "Phone"] },
        { name: "system", label: "System", type: "string" },
        { name: "cost", label: "Cost", type: "money" },
        { name: "status", label: "Status", type: "enum", options: ["Awaiting IT approval", "Approved", "Created", "Ordered", "Delivered", "Rejected"] },
        { name: "requested", label: "Requested", type: "date" },
      ],
      sample: [
        { request_no: "ITR-3301", hire: "Amara Okonkwo", item: "Okta account + Microsoft 365", type: "Account", system: "Okta", cost: 0, status: "Created", requested: "2026-09-23" },
        { request_no: "ITR-3302", hire: "Amara Okonkwo", item: "Epic (RN security class) + Pyxis", type: "Account", system: "Okta", cost: 0, status: "Awaiting IT approval", requested: "2026-09-23" },
        { request_no: "ITR-3303", hire: "Amara Okonkwo", item: "Dell Latitude 7450", type: "Laptop", system: "Coupa", cost: 1420, status: "Ordered", requested: "2026-09-23" },
        { request_no: "ITR-3304", hire: "Daniel Frost", item: "Okta account + Microsoft 365 + Workday Financials", type: "Account", system: "Okta", cost: 0, status: "Created", requested: "2026-09-22" },
        { request_no: "ITR-3305", hire: "Daniel Frost", item: "Dell Latitude 7450", type: "Laptop", system: "Coupa", cost: 1420, status: "Awaiting IT approval", requested: "2026-09-22" },
        { request_no: "ITR-3306", hire: "Sofia Marquez", item: "Epic Willow (Pharmacist) + Pyxis", type: "Account", system: "Okta", cost: 0, status: "Awaiting IT approval", requested: "2026-09-25" },
        { request_no: "ITR-3307", hire: "Kwame Asante", item: "PACS viewer access", type: "Account", system: "Okta", cost: 0, status: "Approved", requested: "2026-09-21" },
        { request_no: "ITR-3308", hire: "Kwame Asante", item: "Dell Precision 5690 (needs department head)", type: "Laptop", system: "Coupa", cost: 2890, status: "Awaiting IT approval", requested: "2026-09-24" },
        { request_no: "ITR-3309", hire: "Hannah Lee", item: "Okta account (expires 2027-01-20) + VPN", type: "Account", system: "Okta", cost: 0, status: "Awaiting IT approval", requested: "2026-09-25" },
      ],
    },
    {
      id: "training",
      name: "Training record",
      plural: "Training records",
      plain: "A required course assigned to a new hire, read from HealthStream.",
      fields: [
        { name: "hire", label: "New hire", type: "string" },
        { name: "course", label: "Course", type: "string" },
        { name: "category", label: "Category", type: "enum", options: ["Privacy", "Infection control", "Safety", "Clinical", "Code of conduct"] },
        { name: "due", label: "Due", type: "date" },
        { name: "progress", label: "Progress %", type: "number" },
        { name: "status", label: "Status", type: "enum", options: ["Assigned", "In progress", "Completed", "Overdue"] },
        { name: "reminders_sent", label: "Reminders sent", type: "number" },
      ],
      sample: [
        { hire: "Marcus Bell", course: "Bloodborne Pathogens", category: "Infection control", due: "2026-09-22", progress: 20, status: "Overdue", reminders_sent: 3 },
        { hire: "Marcus Bell", course: "Fire & Life Safety", category: "Safety", due: "2026-09-25", progress: 60, status: "In progress", reminders_sent: 2 },
        { hire: "Amara Okonkwo", course: "HIPAA Privacy & Security", category: "Privacy", due: "2026-10-02", progress: 40, status: "In progress", reminders_sent: 1 },
        { hire: "Amara Okonkwo", course: "Bloodborne Pathogens", category: "Infection control", due: "2026-10-02", progress: 0, status: "Assigned", reminders_sent: 0 },
        { hire: "Daniel Frost", course: "HIPAA Privacy & Security", category: "Privacy", due: "2026-09-26", progress: 75, status: "In progress", reminders_sent: 1 },
        { hire: "Daniel Frost", course: "Code of Conduct & Compliance", category: "Code of conduct", due: "2026-09-26", progress: 100, status: "Completed", reminders_sent: 0 },
        { hire: "Kwame Asante", course: "Radiation Safety", category: "Clinical", due: "2026-10-02", progress: 0, status: "Assigned", reminders_sent: 0 },
        { hire: "Kwame Asante", course: "HIPAA Privacy & Security", category: "Privacy", due: "2026-10-02", progress: 100, status: "Completed", reminders_sent: 0 },
        { hire: "Sofia Marquez", course: "Controlled Substances Handling", category: "Clinical", due: "2026-10-09", progress: 0, status: "Assigned", reminders_sent: 0 },
      ],
    },
  ],
  connections: [
    { id: "workday", name: "Workday", kind: "http", auth: "oauth", status: "configured", plain: "Brightline's HR system. New hires, roles, managers and start dates come from here, and onboarding plans are saved back." },
    { id: "okta", name: "Okta", kind: "http", auth: "api_key", status: "configured", plain: "Creates staff sign-ins and gives access to apps like Epic. Only after IT approves." },
    { id: "procurement", name: "Procurement (Coupa)", kind: "http", auth: "api_key", status: "missing", plain: "Places laptop orders from the approved hardware catalogue." },
    { id: "slack", name: "Slack", kind: "slack", auth: "oauth", status: "configured", plain: "Posts provisioning requests in #it-onboarding." },
    { id: "lms", name: "HealthStream (training)", kind: "http", auth: "api_key", status: "configured", plain: "Brightline's learning system, where required courses are assigned and completed." },
    { id: "email", name: "Outlook (Microsoft 365)", kind: "email", auth: "oauth", status: "configured", plain: "Sends reminders from onboarding@brightlinehealth.org." },
  ],
  estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "high", breakdown: [] },
};
