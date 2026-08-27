// Single source of truth for every role's sidebar navigation.
// Extracted from people-dashboard.tsx so that both the dashboard router and the administrator
// "Preferred dashboard" picker read the SAME label vocabulary. They previously did not: the picker
// offered dashboard-access grant names ("Dashboard", "Directory", ...) while the router matched
// sidebar labels ("Manager Dashboard", "My Team", ...), so a chosen landing page usually matched no
// sidebar entry and fell through to the empty "not enabled for this account" card.
export const managerGroups = [
  [
    "OVERVIEW",
    [
      ["Manager Dashboard", "⌂"],
      ["My Profile", "●"],
    ],
  ],
  [
    "PEOPLE",
    [
      ["My Team", "♟"],
      ["Recruitment & Onboarding", "⌕"],
      ["Employee Requests", "!"],
    ],
  ],
  [
    "LEAVE MANAGEMENT",
    [
      ["Team Attendance", "◷"],
      ["Leave Approvals", "✓"],
      ["Shift & Schedules", "▤"],
      ["Meetings & Calendar", "▤"],
    ],
  ],
  [
    "PERFORMANCE",
    [
      ["Tasks", "☑"],
      ["Learning & Development", "▤"],
    ],
  ],
  [
    "OPERATIONS",
    [
      ["Expense Approvals", "¤"],
      ["Purchase Approvals", "▣"],
      ["Documents", "◫"],
      ["Assets", "▣"],
    ],
  ],
  [
    "ENGAGEMENT",
    [
      ["Team Communication", "✉"],
      ["Notifications", "●"],
    ],
  ],
  [
    "SYSTEM",
    [
      ["Reports & Analytics", "▥"],
      ["AI Manager Assistant", "✦"],
    ],
  ],
] as const;

export const hrGroups = [
  [
    "OVERVIEW",
    [
      ["HR Dashboard", "⌂"],
      ["My Profile", "●"],
    ],
  ],
  [
    "PEOPLE",
    [
      ["Employee Management", "♟"],
      ["Recruitment", "⌕"],
      ["Onboarding", "↗"],
      ["Offboarding", "↘"],
      ["Organization Structure", "▦"],
    ],
  ],
  [
    "LEAVE MANAGEMENT",
    [
      ["Attendance Management", "◷"],
      ["Live Attendance", "◷"],
      ["Leave Management", "◴"],
      ["Meetings & Calendar", "▤"],
    ],
  ],
  ["PERFORMANCE", [["Learning & Development", "▤"]]],
  [
    "OPERATIONS",
    [
      ["Payroll Administration", "▧"],
      ["Expense Management", "¤"],
      ["Benefits Administration", "♡"],
      ["Documents & Templates", "◫"],
      ["Asset Management", "▣"],
    ],
  ],
  [
    "ENGAGEMENT",
    [
      ["Announcements & Communication", "✉"],
      ["Employee Relations & Cases", "!"],
      ["HR Help Desk", "?"],
    ],
  ],
  [
    "SYSTEM",
    [
      ["Reports & Analytics", "▥"],
      ["Workflows & Approvals", "⇄"],
      ["Notifications", "●"],
      ["AI HR Assistant", "✦"],
      ["Profile Requests", "✎"],
    ],
  ],
] as const;

export const adminGroups = [
  [
    "OVERVIEW",
    [
      ["Administrator Dashboard", "⌂"],
      ["My Profile", "●"],
    ],
  ],
  [
    "ACCESS CONTROL",
    [
      ["User & Account Management", "♟"],
      ["Roles & Permissions", "⚿"],
      ["Profile Requests", "✎"],
    ],
  ],
  [
    "WORKFORCE",
    [
      ["Employee Management", "◎"],
      ["Organization Structure", "▦"],
    ],
  ],
  [
    "TIME & LEAVE",
    [
      ["Attendance Management", "◷"],
      ["Live Attendance", "◷"],
      ["Leave Management", "◴"],
      ["Meetings & Calendar", "▤"],
    ],
  ],
  [
    "TALENT",
    [
      ["Recruitment", "⌕"],
      ["Onboarding", "↗"],
      ["Offboarding", "↘"],
      ["Performance Management", "★"],
      ["Learning & Development", "▤"],
    ],
  ],
  [
    "PAYROLL & PEOPLE SERVICES",
    [
      ["Payroll & Payslips", "▧"],
      ["Expenses", "¤"],
      ["Procurement Control", "▣"],
      ["Benefits", "♡"],
    ],
  ],
  [
    "DOCUMENTS & ASSETS",
    [
      ["Documents & Templates", "◫"],
      ["Book Library", "📚"],
      ["Asset Management", "▣"],
    ],
  ],
  [
    "EMPLOYEE RELATIONS",
    [
      ["Employee Relations & Cases", "!"],
      ["Communication", "✉"],
      ["Help Desk & Support", "?"],
    ],
  ],
  [
    "CONTROL & INSIGHTS",
    [
      ["Reports & Analytics", "▥"],
      ["Approval Workflows", "⇄"],
      ["Notifications", "●"],
      ["AI Admin Assistant", "✦"],
    ],
  ],
  [
    "SYSTEM",
    [
      ["Settings Centre", "⚙"],
      ["Audit Logs", "▤"],
      ["Import & Export", "⇅"],
    ],
  ],
] as const;

export const employeeGroups = [
  [
    "",
    [
      ["Home", "⌂"],
      ["My Info", "●"],
      ["People", "♟"],
      ["Time Off", "◴"],
      ["Performance", "★"],
      ["Payroll", "▧"],
      ["Benefits", "♡"],
      ["Documents", "◫"],
      ["Training", "▤"],
      ["Recruitment", "⌕"],
      ["Assets", "▣"],
      ["Calendar", "▤"],
      ["Requests", "⇄"],
      ["Purchase Requests", "▣"],
      ["Notifications", "●"],
      ["Reports", "▥"],
      ["Support", "?"],
      ["Settings", "⚙"],
    ],
  ],
] as const;
export const employeeQuickLabels = ["Ask"] as const;

export const auditorGroups = [
  ["OVERVIEW", [["Audit Dashboard", "▤"]]],
  [
    "COMPLIANCE",
    [
      ["Employee Directory", "◎"],
      ["Attendance Management", "◷"],
      ["Leave Management", "◴"],
      ["Documents & Templates", "◫"],
      ["Reports & Analytics", "▥"],
    ],
  ],
] as const;
