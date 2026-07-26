export type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "date" | "datetime-local" | "number" | "textarea" | "select" | "email" | "file";
  required?: boolean;
  options?: string[];
  relation?: "employees" | "departments" | "branches";
};

export type ModuleConfig = {
  title: string;
  singular: string;
  subtitle: string;
  table: string;
  icon: string;
  columns: { key: string; label: string }[];
  fields: FieldConfig[];
};

export const workspaceModules: Record<string, ModuleConfig> = {
  Employees: {
    title: "Employees", singular: "employee", table: "employees", icon: "E",
    subtitle: "Manage active and archived employee records.",
    columns: [{key:"employee_number",label:"Employee ID"},{key:"first_name",label:"First name"},{key:"last_name",label:"Last name"},{key:"work_email",label:"Work email"},{key:"position_title",label:"Position"},{key:"employment_status",label:"Status"}],
    fields: [{key:"passport_photo_path",label:"Passport-size photograph",type:"file"},{key:"employee_number",label:"Employee ID",required:true},{key:"first_name",label:"First name",required:true},{key:"middle_name",label:"Middle name"},{key:"last_name",label:"Last name",required:true},{key:"preferred_name",label:"Preferred name"},{key:"work_email",label:"Work email",type:"email",required:true},{key:"personal_email",label:"Personal email",type:"email"},{key:"phone",label:"Phone"},{key:"date_of_birth",label:"Date of birth",type:"date"},{key:"gender",label:"Gender",type:"select",options:["Female","Male","Non-binary","Prefer not to say"]},{key:"nationality",label:"Nationality"},{key:"marital_status",label:"Marital status",type:"select",options:["Single","Married","Divorced","Widowed","Prefer not to say"]},{key:"residential_address",label:"Residential address",type:"textarea"},{key:"digital_address",label:"Digital address"},{key:"biography",label:"Professional biography",type:"textarea"},{key:"linkedin_url",label:"LinkedIn profile"},{key:"department_id",label:"Department",type:"select",relation:"departments"},{key:"position_title",label:"Position title"},{key:"manager_id",label:"Manager",type:"select",relation:"employees"},{key:"branch",label:"Branch"},{key:"employment_type",label:"Employment type",type:"select",options:["Full time","Part time","Contract","Internship","Consultant"]},{key:"start_date",label:"Start date",type:"date"},{key:"probation_end_date",label:"Probation end date",type:"date"},{key:"contract_end_date",label:"Contract end date",type:"date"},{key:"emergency_contact_name",label:"Emergency contact"},{key:"emergency_contact_phone",label:"Emergency phone"},{key:"emergency_contact_relationship",label:"Emergency relationship"},{key:"skills",label:"Skills",type:"textarea"},{key:"qualifications",label:"Qualifications",type:"textarea"},{key:"ghana_card_number",label:"Ghana Card number"},{key:"ssnit_number",label:"SSNIT number"},{key:"bank_name",label:"Bank name"},{key:"bank_account_name",label:"Bank account name"},{key:"bank_account_number",label:"Bank account number"},{key:"internal_notes",label:"Confidential HR notes",type:"textarea"},{key:"employment_status",label:"Status",type:"select",options:["active","probation","leave","suspended","ended","archived"],required:true}],
  },
  Onboarding: {
    title:"Onboarding",singular:"onboarding journey",table:"employee_onboarding",icon:"O",subtitle:"Track every new employee through a structured onboarding journey.",
    columns:[{key:"employee_name",label:"Employee"},{key:"status",label:"Status"},{key:"progress",label:"Progress"},{key:"due_date",label:"Due date"},{key:"notes",label:"Notes"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"status",label:"Status",type:"select",options:["not_started","in_progress","needs_attention","completed","overdue"],required:true},{key:"progress",label:"Progress (%)",type:"number",required:true},{key:"due_date",label:"Due date",type:"date"},{key:"notes",label:"Notes",type:"textarea"}],
  },
  Documents: {
    title:"Documents",singular:"document",table:"employee_documents",icon:"D",subtitle:"Securely catalogue, verify, and monitor employee documents.",
    columns:[{key:"employee_name",label:"Employee"},{key:"document_name",label:"Document"},{key:"category",label:"Category"},{key:"status",label:"Status"},{key:"expiry_date",label:"Expiry"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"document_name",label:"Document name",required:true},{key:"category",label:"Category",required:true},{key:"status",label:"Status",type:"select",options:["pending","verified","rejected","expired"],required:true},{key:"expiry_date",label:"Expiry date",type:"date"},{key:"confidentiality",label:"Confidentiality",type:"select",options:["internal","confidential","restricted"],required:true}],
  },
  Attendance: {
    title:"Attendance",singular:"attendance record",table:"attendance_records",icon:"A",subtitle:"Monitor attendance, lateness, remote work, and absence.",
    columns:[{key:"employee_name",label:"Employee"},{key:"attendance_date",label:"Date"},{key:"clock_in",label:"Clock in"},{key:"clock_out",label:"Clock out"},{key:"status",label:"Status"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"attendance_date",label:"Date",type:"date",required:true},{key:"clock_in",label:"Clock in"},{key:"clock_out",label:"Clock out"},{key:"status",label:"Status",type:"select",options:["present","late","absent","remote","travel","leave"],required:true},{key:"notes",label:"Notes",type:"textarea"}],
  },
  Leave: {
    title:"Leave",singular:"leave request",table:"leave_requests",icon:"L",subtitle:"Administer leave requests, approvals, and absence periods.",
    columns:[{key:"employee_name",label:"Employee"},{key:"leave_type",label:"Leave type"},{key:"start_date",label:"Starts"},{key:"end_date",label:"Ends"},{key:"days",label:"Days"},{key:"status",label:"Status"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"leave_type",label:"Leave type",type:"select",options:["Annual leave","Sick leave","Maternity leave","Paternity leave","Compassionate leave","Study leave","Unpaid leave"],required:true},{key:"start_date",label:"Start date",type:"date",required:true},{key:"end_date",label:"End date",type:"date",required:true},{key:"days",label:"Days",type:"number",required:true},{key:"status",label:"Status",type:"select",options:["draft","pending","approved","rejected","cancelled"],required:true},{key:"reason",label:"Reason",type:"textarea"}],
  },
  Performance: {
    title:"Performance",singular:"performance review",table:"performance_reviews",icon:"P",subtitle:"Coordinate objectives, probation reviews, and performance cycles.",
    columns:[{key:"employee_name",label:"Employee"},{key:"review_type",label:"Review type"},{key:"review_period",label:"Period"},{key:"status",label:"Status"},{key:"rating",label:"Rating"},{key:"due_date",label:"Due"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"review_type",label:"Review type",type:"select",options:["30-day probation","60-day probation","90-day probation","annual","mid-year"],required:true},{key:"review_period",label:"Review period",required:true},{key:"status",label:"Status",type:"select",options:["draft","self_assessment","manager_review","hr_review","completed"],required:true},{key:"rating",label:"Rating",type:"number"},{key:"due_date",label:"Due date",type:"date"},{key:"summary",label:"Summary",type:"textarea"}],
  },
  Assets: {
    title:"Assets",singular:"asset",table:"assets",icon:"A",subtitle:"Track SAS equipment, assignments, condition, and returns.",
    columns:[{key:"asset_code",label:"SAS asset ID"},{key:"category",label:"Category"},{key:"description",label:"Description"},{key:"serial_number",label:"Serial number"},{key:"employee_name",label:"Assigned to"},{key:"status",label:"Status"}],
    fields:[{key:"asset_code",label:"SAS asset ID",required:true},{key:"category",label:"Category",type:"select",options:["Laptop","Desktop computer","Mobile phone","Access card","Office key","Monitor","Headset","Software licence","Furniture","Other"],required:true},{key:"description",label:"Description",required:true},{key:"brand",label:"Brand"},{key:"model",label:"Model"},{key:"serial_number",label:"Serial number"},{key:"condition",label:"Condition",type:"select",options:["new","good","fair","damaged"],required:true},{key:"assigned_employee_id",label:"Assigned employee",type:"select",relation:"employees"},{key:"status",label:"Status",type:"select",options:["available","assigned","maintenance","retired","lost"],required:true}],
  },
  "HR Requests": {
    title:"HR Requests",singular:"HR request",table:"hr_requests",icon:"H",subtitle:"Receive, assign, and resolve employee support requests.",
    columns:[{key:"subject",label:"Subject"},{key:"request_type",label:"Type"},{key:"employee_name",label:"Employee"},{key:"priority",label:"Priority"},{key:"status",label:"Status"},{key:"created_at",label:"Created"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees"},{key:"request_type",label:"Request type",required:true},{key:"subject",label:"Subject",required:true},{key:"description",label:"Description",type:"textarea"},{key:"priority",label:"Priority",type:"select",options:["low","normal","high","urgent"],required:true},{key:"status",label:"Status",type:"select",options:["open","in_progress","waiting","resolved","closed"],required:true}],
  },
  Announcements: {
    title:"Announcements",singular:"announcement",table:"announcements",icon:"A",subtitle:"Publish internal news and notices to the right audience.",
    columns:[{key:"title",label:"Title"},{key:"audience",label:"Audience"},{key:"status",label:"Status"},{key:"publish_at",label:"Publish date"},{key:"created_at",label:"Created"}],
    fields:[{key:"title",label:"Title",required:true},{key:"body",label:"Message",type:"textarea",required:true},{key:"audience",label:"Audience",type:"select",options:["all","employees","managers","hr","department_heads"],required:true},{key:"status",label:"Status",type:"select",options:["draft","published","archived"],required:true},{key:"publish_at",label:"Publish date"}],
  },
  Tasks: {
    title:"Tasks",singular:"task",table:"tasks",icon:"T",subtitle:"Assign, prioritise, and track work across employee dashboards.",
    columns:[{key:"title",label:"Task"},{key:"employee_name",label:"Assigned to"},{key:"category",label:"Category"},{key:"priority",label:"Priority"},{key:"status",label:"Status"},{key:"due_date",label:"Due"}],
    fields:[{key:"title",label:"Task title",required:true},{key:"description",label:"Description",type:"textarea"},{key:"assigned_to_employee_id",label:"Assigned employee",type:"select",relation:"employees"},{key:"category",label:"Category",type:"select",options:["general","onboarding","documents","performance","compliance","training"],required:true},{key:"priority",label:"Priority",type:"select",options:["low","normal","high","urgent"],required:true},{key:"status",label:"Status",type:"select",options:["not_started","in_progress","blocked","completed","cancelled"],required:true},{key:"due_date",label:"Due date",type:"date"}],
  },
  Payroll: {
    title:"Payroll",singular:"payroll record",table:"payroll_records",icon:"P",subtitle:"Prepare and track confidential Ghana payroll records and payslip data.",
    columns:[{key:"employee_name",label:"Employee"},{key:"pay_period",label:"Pay period"},{key:"basic_salary",label:"Basic salary"},{key:"taxable_income",label:"Taxable income"},{key:"paye_tax",label:"PAYE"},{key:"employee_ssnit",label:"Employee SSNIT"},{key:"tier_two",label:"Tier 2"},{key:"tier_three",label:"Tier 3"},{key:"net_pay",label:"Net pay"},{key:"status",label:"Status"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"pay_period",label:"Pay period (YYYY-MM)",required:true},{key:"currency",label:"Currency",type:"select",options:["GHS"],required:true},{key:"basic_salary",label:"Basic salary",type:"number",required:true},{key:"allowances",label:"Taxable allowances",type:"number"},{key:"bonuses",label:"Bonuses",type:"number"},{key:"overtime",label:"Overtime",type:"number"},{key:"tier_three",label:"Voluntary Tier 3 contribution",type:"number"},{key:"other_deductions",label:"Other deductions",type:"number"},{key:"status",label:"Status",type:"select",options:["draft","reviewed","approved","paid","void"],required:true},{key:"payment_date",label:"Payment date",type:"date"},{key:"notes",label:"Payroll notes",type:"textarea"}],
  },
  Hiring: {
    title:"Hiring",singular:"job opening",table:"job_openings",icon:"H",subtitle:"Manage vacancies, hiring managers, requirements, and closing dates.",
    columns:[{key:"title",label:"Role"},{key:"location",label:"Location"},{key:"employment_type",label:"Employment type"},{key:"openings",label:"Openings"},{key:"status",label:"Status"},{key:"closing_date",label:"Closes"}],
    fields:[{key:"title",label:"Job title",required:true},{key:"department_id",label:"Department",type:"select",relation:"departments"},{key:"location",label:"Location"},{key:"employment_type",label:"Employment type",type:"select",options:["Full time","Part time","Contract","Internship"],required:true},{key:"description",label:"Description",type:"textarea"},{key:"requirements",label:"Requirements",type:"textarea"},{key:"openings",label:"Number of openings",type:"number",required:true},{key:"status",label:"Status",type:"select",options:["draft","open","interviewing","offer","filled","closed"],required:true},{key:"closing_date",label:"Closing date",type:"date"}],
  },
  Candidates: {
    title:"Candidates",singular:"candidate",table:"candidates",icon:"C",subtitle:"Track applicants through interviews, offers, hiring, and onboarding.",
    columns:[{key:"full_name",label:"Candidate"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"stage",label:"Stage"},{key:"rating",label:"Rating"},{key:"interview_date",label:"Interview"}],
    fields:[{key:"full_name",label:"Full name",required:true},{key:"email",label:"Email",type:"email",required:true},{key:"phone",label:"Phone"},{key:"stage",label:"Stage",type:"select",options:["applied","screening","interview","assessment","offer","hired","rejected","withdrawn"],required:true},{key:"rating",label:"Rating",type:"number"},{key:"interview_date",label:"Interview date",type:"datetime-local"},{key:"notes",label:"Notes",type:"textarea"}],
  },
  "Onboarding media": {
    title:"Onboarding media",singular:"media item",table:"onboarding_media",icon:"V",subtitle:"Share welcome videos, pictures, guides, and links with new employees.",
    columns:[{key:"title",label:"Title"},{key:"media_type",label:"Type"},{key:"external_url",label:"Link"},{key:"audience",label:"Audience"},{key:"status",label:"Status"}],
    fields:[{key:"title",label:"Title",required:true},{key:"description",label:"Description",type:"textarea"},{key:"media_type",label:"Media type",type:"select",options:["video","image","document","link","text"],required:true},{key:"external_url",label:"Video or media URL"},{key:"audience",label:"Audience",type:"select",options:["all","new_hires","employees","managers"],required:true},{key:"sort_order",label:"Sort order",type:"number"},{key:"status",label:"Status",type:"select",options:["draft","published","archived"],required:true}],
  },
  Benefits: {
    title:"Benefits",singular:"benefit plan",table:"benefit_plans",icon:"B",subtitle:"Configure benefit plans, contribution costs, eligibility, and enrolment.",
    columns:[{key:"name",label:"Plan"},{key:"category",label:"Category"},{key:"provider",label:"Provider"},{key:"employer_contribution",label:"Employer"},{key:"employee_contribution",label:"Employee"},{key:"status",label:"Status"}],
    fields:[{key:"name",label:"Plan name",required:true},{key:"category",label:"Category",type:"select",options:["Health","Life","Pension","Wellness","Transport","Education","Other"],required:true},{key:"provider",label:"Provider"},{key:"description",label:"Description",type:"textarea"},{key:"employer_contribution",label:"Employer contribution",type:"number"},{key:"employee_contribution",label:"Employee contribution",type:"number"},{key:"eligibility",label:"Eligibility rules",type:"textarea"},{key:"status",label:"Status",type:"select",options:["active","inactive","open_enrolment"],required:true}],
  },
  Compensation: {
    title:"Compensation",singular:"compensation record",table:"compensation_records",icon:"C",subtitle:"Manage pay grades, salary changes, variable pay, and total rewards.",
    columns:[{key:"employee_name",label:"Employee"},{key:"effective_date",label:"Effective"},{key:"pay_grade",label:"Grade"},{key:"base_salary",label:"Base salary"},{key:"variable_pay",label:"Variable pay"},{key:"status",label:"Status"}],
    fields:[{key:"employee_id",label:"Employee",type:"select",relation:"employees",required:true},{key:"effective_date",label:"Effective date",type:"date",required:true},{key:"pay_grade",label:"Pay grade"},{key:"pay_frequency",label:"Pay frequency",type:"select",options:["monthly","weekly","hourly"],required:true},{key:"base_salary",label:"Base salary",type:"number",required:true},{key:"variable_pay",label:"Variable pay",type:"number"},{key:"equity_value",label:"Equity / long-term value",type:"number"},{key:"reason",label:"Reason",type:"textarea"},{key:"status",label:"Status",type:"select",options:["proposed","approved","active","superseded"],required:true}],
  },
  Community: {
    title:"Community",singular:"post",table:"community_posts",icon:"C",subtitle:"Create rich employee posts, updates, recognition, and internal community content.",
    columns:[{key:"title",label:"Post"},{key:"audience",label:"Audience"},{key:"status",label:"Status"},{key:"is_pinned",label:"Pinned"},{key:"created_at",label:"Published"}],
    fields:[{key:"title",label:"Title",required:true},{key:"body",label:"Post content",type:"textarea",required:true},{key:"media_type",label:"Media type",type:"select",options:["none","image","video","link"]},{key:"media_path",label:"Media URL"},{key:"audience",label:"Audience",type:"select",options:["all","employees","managers","hr","new_hires"],required:true},{key:"status",label:"Status",type:"select",options:["draft","published","archived"],required:true},{key:"is_pinned",label:"Pin post",type:"select",options:["true","false"],required:true}],
  },
  Meetings: {
    title:"Meetings",singular:"meeting",table:"meetings",icon:"M",subtitle:"Schedule Teams or external meetings and track attendee responses.",
    columns:[{key:"title",label:"Meeting"},{key:"meeting_provider",label:"Provider"},{key:"starts_at",label:"Starts"},{key:"ends_at",label:"Ends"},{key:"location",label:"Location"},{key:"status",label:"Status"}],
    fields:[{key:"title",label:"Meeting title",required:true},{key:"description",label:"Description",type:"textarea"},{key:"meeting_provider",label:"Provider",type:"select",options:["Microsoft Teams","Google Meet","Zoom","In person","Other"],required:true},{key:"meeting_url",label:"Meeting link"},{key:"starts_at",label:"Starts",type:"datetime-local",required:true},{key:"ends_at",label:"Ends",type:"datetime-local",required:true},{key:"location",label:"Location"},{key:"status",label:"Status",type:"select",options:["scheduled","completed","cancelled"],required:true}],
  },
  Backups: {
    title:"Backups",singular:"backup request",table:"backup_records",icon:"B",subtitle:"Track encrypted backup requests, completion, and restore testing.",
    columns:[{key:"backup_type",label:"Type"},{key:"status",label:"Status"},{key:"created_at",label:"Requested"},{key:"completed_at",label:"Completed"},{key:"restore_tested_at",label:"Restore tested"},{key:"notes",label:"Notes"}],
    fields:[{key:"backup_type",label:"Backup type",type:"select",options:["manual","scheduled","pre_restore","compliance"],required:true},{key:"status",label:"Status",type:"select",options:["requested","running","completed","failed","restored"],required:true},{key:"completed_at",label:"Completed at",type:"datetime-local"},{key:"restore_tested_at",label:"Restore tested at",type:"datetime-local"},{key:"notes",label:"Notes",type:"textarea"}],
  },
  Policies: {
    title:"Policies",singular:"policy",table:"policies",icon:"P",subtitle:"Publish controlled HR policies and acknowledgement requirements.",
    columns:[{key:"title",label:"Policy"},{key:"category",label:"Category"},{key:"version",label:"Version"},{key:"status",label:"Status"},{key:"requires_acknowledgement",label:"Acknowledgement"},{key:"effective_date",label:"Effective"}],
    fields:[{key:"title",label:"Policy title",required:true},{key:"category",label:"Category",type:"select",options:["HR","Security","Compliance","Leave","Attendance","Workplace","Privacy"],required:true},{key:"version",label:"Version",required:true},{key:"summary",label:"Summary",type:"textarea"},{key:"content",label:"Policy content",type:"textarea"},{key:"status",label:"Status",type:"select",options:["draft","published","archived"],required:true},{key:"requires_acknowledgement",label:"Requires acknowledgement",type:"select",options:["true","false"],required:true},{key:"effective_date",label:"Effective date",type:"date"}],
  },
  Branches: {
    title:"Branches",singular:"branch",table:"branches",icon:"B",subtitle:"Maintain SAS offices and employee work locations.",
    columns:[{key:"name",label:"Branch"},{key:"location",label:"Location"},{key:"status",label:"Status"},{key:"updated_at",label:"Updated"}],
    fields:[{key:"name",label:"Branch name",required:true},{key:"location",label:"Location"},{key:"status",label:"Status",type:"select",options:["active","inactive"],required:true}],
  },
  Reports: {
    title:"Reports",singular:"saved report",table:"saved_reports",icon:"R",subtitle:"Create and maintain reusable SAS reporting views.",
    columns:[{key:"name",label:"Report name"},{key:"report_type",label:"Type"},{key:"format",label:"Format"},{key:"last_generated_at",label:"Last generated"},{key:"created_at",label:"Created"}],
    fields:[{key:"name",label:"Report name",required:true},{key:"report_type",label:"Report type",type:"select",options:["Headcount","Onboarding","Documents","Attendance","Leave","Performance","Assets","HR requests","Audit"],required:true},{key:"description",label:"Description",type:"textarea"},{key:"format",label:"Format",type:"select",options:["dashboard","xlsx","pdf"],required:true}],
  },
  Settings: {
    title:"Settings",singular:"setting",table:"system_settings",icon:"S",subtitle:"Configure organisation-wide SAS People behaviour.",
    columns:[{key:"setting_key",label:"Setting"},{key:"setting_value",label:"Value"},{key:"category",label:"Category"},{key:"description",label:"Description"},{key:"updated_at",label:"Updated"}],
    fields:[{key:"setting_key",label:"Setting key",required:true},{key:"setting_value",label:"Value"},{key:"category",label:"Category",type:"select",options:["company","general","employees","localisation","attendance","leave","performance","documents","payroll","security","notifications","integrations"],required:true},{key:"description",label:"Description",type:"textarea"}],
  },
  "Security & audit": {
    title:"Security & audit",singular:"security event",table:"security_events",icon:"S",subtitle:"Review security signals and protected administrative activity.",
    columns:[{key:"event_type",label:"Event type"},{key:"severity",label:"Severity"},{key:"description",label:"Description"},{key:"outcome",label:"Outcome"},{key:"created_at",label:"Created"}],
    fields:[{key:"event_type",label:"Event type",required:true},{key:"severity",label:"Severity",type:"select",options:["info","warning","high","critical"],required:true},{key:"description",label:"Description",type:"textarea",required:true},{key:"outcome",label:"Outcome",required:true}],
  },
};
