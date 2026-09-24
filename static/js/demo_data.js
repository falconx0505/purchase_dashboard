/* ═══════════════════════════════════════════════════════════════════
   DEMO DATA  —  static / hardcoded data for all non-purchase modules.
   This is intentionally kept separate from main.js so that when a
   module goes production, its data block can be deleted here and
   replaced with a real API call in main.js without touching anything
   else.

   Load order in index.html:
     <script src="/static/js/demo_data.js"></script>   ← this file first
     <script src="/static/js/main.js"></script>
════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// IT CONTROLS  (demo — no backend endpoint yet)
// ─────────────────────────────────────────────────────────────

const IT_EMPLOYEES = [
  'Priya Sharma', 'Rohit Verma', 'Ananya Iyer',
  'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai',
];

/**
 * Each card uses a [min, max] range so metric values are re-generated
 * randomly on every render (instead of a fixed list).
 * When real IT-Controls data is available, replace this array with an
 * API call and delete the randInt() helper in main.js.
 */
const IT_TABLES = [
  {
    id: 'access_lwd', category: 'itc_access_lwd',
    title: 'Access After Last Working Day',
    desc: 'System access retained after employee exit',
    metricLabel: 'Days After Last Working Day',
    min: 1, max: 20,
    employees: ['Priya Sharma', 'Rohit Verma', 'Ananya Iyer', 'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai'],
  },
  {
    id: 'inactive_90', category: 'itc_inactive_90',
    title: 'Users Not Logged In for 90+ Days',
    desc: 'Dormant accounts still active in the system',
    metricLabel: 'Days Not Logged In',
    min: 91, max: 400,
    employees: ['Vikram Singh', 'Neha Kulkarni', 'Aditya Rao', 'Ishita Desai', 'Manish Gupta', 'Pooja Joshi', 'Siddharth Kapoor'],
  },
  {
    id: 'pwd_stale', category: 'itc_pwd_stale',
    title: 'Password Not Changed',
    desc: 'Accounts exceeding password rotation policy',
    metricLabel: 'Days Since Password Changed',
    min: 91, max: 250,
    employees: ['Ravi Kumar', 'Meera Nair', 'Sanjay Patil', 'Kavya Menon', 'Nikhil Chandra', 'Anjali Rao', 'Deepak Bhatt'],
  },
  {
    id: 'after_hours', category: 'itc_after_hours',
    title: 'Login Outside Business Hours',
    desc: 'Sign-ins recorded outside approved working hours',
    metricLabel: 'Logins After Office Hours',
    min: 1, max: 15,
    employees: ['Tanvi Shah', 'Aakash Bose', 'Ritika Malhotra', 'Varun Sethi', 'Shreya Agarwal', 'Harsh Vardhan', 'Nisha Kohli'],
  },
  {
    id: 'failed_login', category: 'itc_failed_login',
    title: 'Multiple Failed Login Attempts',
    desc: 'Repeated unsuccessful sign-in attempts',
    metricLabel: 'Failed Login Attempts',
    min: 5, max: 45,
    employees: ['Gaurav Khanna', 'Swati Deshmukh', 'Yash Thakur', 'Preeti Saxena', 'Manoj Tiwari', 'Radhika Iyengar', 'Aman Chopra'],
  },
  {
    id: 'above_limit', category: 'itc_above_limit',
    title: 'Approved Above Authorized Limit',
    desc: 'Transactions approved beyond the approver\u2019s authority',
    metricLabel: 'Transactions Above Limit',
    min: 3, max: 35,
    employees: ['Ramesh Iyer', 'Sunita Bhatia', 'Kunal Oberoi', 'Lavanya Pillai', 'Rahul Dutta', 'Simran Bakshi', 'Ajay Mathur'],
  },
];

// ─────────────────────────────────────────────────────────────
// CONTROL INVENTORY  (demo)
// ─────────────────────────────────────────────────────────────

const CONTROL_INVENTORY = [
  {
    control: 'IT controls',
    subcontrols: [
      'access after last working day',
      'user not logged in for 90+ days',
      'password not changed',
      'login outside business hours',
      'multiple failed login attempts',
      'approved above authorized limit',
    ],
  },
  {
    control: 'hr and payroll',
    subcontrols: [
      'multiple employees using same bank account',
      'duplicate pan/aadhaar/bank account',
      'employees without PAN/Aadhaar bank account',
      'missing department/location/grade',
      'same PAN for multiple employees',
    ],
  },
  { control: 'Audit trail', subcontrols: [] },
  {
    control: 'Loan and repayment schedule',
    subcontrols: ['as per calculation, as per bank, as per difference'],
  },
  {
    control: 'Purchase control dashboard',
    subcontrols: [
      'Multiple tax code',
      'same product multiple gst rate',
      'duplicate customer name',
      'product name check',
      'product code check',
    ],
  },
];

const CONTROL_INVENTORY_REGIONS = [
  'Bangalore', 'Mumbai', 'Delhi NCR', 'Hyderabad',
  'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
];

const CONTROL_INVENTORY_EMAILS = [
  'aarav.shah@example.com', 'ananya.iyer@example.com', 'arjun.nair@example.com',
  'divya.pillai@example.com', 'karan.mehta@example.com', 'priya.sharma@example.com',
  'rohit.verma@example.com', 'sneha.reddy@example.com', 'vikram.singh@example.com',
];

// ─────────────────────────────────────────────────────────────
// HR & PAYROLL  (demo — no backend endpoint yet)
// ─────────────────────────────────────────────────────────────

const HR_EMPLOYEES = [
  'Priya Sharma', 'Rohit Verma', 'Ananya Iyer',
  'Karan Mehta', 'Sneha Reddy', 'Arjun Nair', 'Divya Pillai',
];

/**
 * mode: 'rows'     → table is fully described by cols/rows, one row per record.
 * mode: 'employee' → one row per HR_EMPLOYEES entry, with optional nameLabel.
 * When real HR data is available, replace HR_TABLES with an API response.
 */
const HR_TABLES = [
  {
    id: 'dup_bank', category: 'hr_dup_bank', mode: 'rows',
    title: 'Multiple employees using same bank account',
    desc: 'Same bank account number mapped to more than one employee',
    cols: [{ label: 'Bank account number', key: 'acct' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { acct: '50100234567891', names: 'Priya Sharma, Rohit Verma' },
      { acct: '50100987654321', names: 'Ananya Iyer, Karan Mehta, Sneha Reddy' },
      { acct: '50100456789012', names: 'Arjun Nair, Divya Pillai' },
      { acct: '50100112233445', names: 'Priya Sharma, Ananya Iyer' },
      { acct: '50100556677889', names: 'Rohit Verma, Karan Mehta' },
      { acct: '50100998877665', names: 'Sneha Reddy, Divya Pillai' },
      { acct: '50100223344556', names: 'Arjun Nair, Priya Sharma' },
    ],
  },
  {
    id: 'dup_pan_aadhaar', category: 'hr_dup_pan_aadhaar', mode: 'rows',
    title: 'Duplicate PAN/Aadhaar/Bank Account',
    desc: 'Same statutory ID or bank account number recorded against more than one employee',
    cols: [{ label: 'Particulars', key: 'particulars' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { particulars: 'PAN', names: 'Priya Sharma, Rohit Verma' },
      { particulars: 'Aadhaar', names: 'Ananya Iyer, Karan Mehta' },
      { particulars: 'Bank Account', names: 'Sneha Reddy, Arjun Nair' },
      { particulars: 'PAN', names: 'Divya Pillai, Priya Sharma' },
      { particulars: 'PAN', names: 'Rohit Verma, Sneha Reddy' },
      { particulars: 'PAN', names: 'Karan Mehta, Ananya Iyer' },
      { particulars: 'PAN', names: 'Arjun Nair, Divya Pillai' },
    ],
  },
  {
    id: 'missing_ids', category: 'hr_missing_ids', mode: 'employee', nameLabel: 'Name of Employee',
    title: 'Employees without PAN/ Aadhaar Bank Account',
    desc: 'Statutory or payment details missing from employee master',
    cols: [{ label: 'Missing Detail', key: 'missing' }],
    rows: [
      { missing: 'Bank Account' }, { missing: 'PAN' }, { missing: 'Aadhaar' },
      { missing: 'Bank Account' }, { missing: 'PAN' }, { missing: 'Aadhaar' },
      { missing: 'Bank Account' },
    ],
  },
  {
    id: 'missing_master', category: 'hr_missing_master', mode: 'employee', nameLabel: 'Name of Employee',
    title: 'Missing Department/Location/Grade',
    desc: 'Core master fields left blank in the employee record',
    cols: [{ label: 'Missing Detail', key: 'missing' }],
    rows: [
      { missing: 'Department Missing' }, { missing: 'Location Missing' }, { missing: 'Grade Missing' },
      { missing: 'Department Missing' }, { missing: 'Location Missing' }, { missing: 'Grade Missing' },
      { missing: 'Department Missing' },
    ],
  },
  {
    id: 'same_pan', category: 'hr_same_pan', mode: 'rows',
    title: 'Same PAN for multiple employees',
    desc: 'Same PAN number recorded against more than one employee',
    cols: [{ label: 'Pan Number', key: 'pan' }, { label: 'Employee Name', key: 'names' }],
    rows: [
      { pan: 'ABCPS1234M', names: 'Priya Sharma, Rohit Verma' },
      { pan: 'BXTRV5678K', names: 'Ananya Iyer, Karan Mehta' },
      { pan: 'CMNPK9081L', names: 'Sneha Reddy, Arjun Nair' },
      { pan: 'DPQRX3345F', names: 'Divya Pillai, Priya Sharma' },
      { pan: 'EFGHT7729Q', names: 'Rohit Verma, Sneha Reddy' },
      { pan: 'FGHIJ1122W', names: 'Karan Mehta, Ananya Iyer' },
      { pan: 'GHTYU5566E', names: 'Arjun Nair, Divya Pillai' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// LOAN REPAYMENT SCHEDULE  (demo)
// Each row: [Person, Month, Opening, Interest, Principal, EMI, Closing, Rate, OtherCharge?]
// ─────────────────────────────────────────────────────────────

const LOAN_TYPE_OPTIONS = ['Home Loan', 'Vehicle Loan', 'Personal Loan', 'Business Loan', 'Education Loan'];
const LOAN_LOCATION_OPTIONS = ['Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune'];

const LOAN_CALC_ROWS = [
  ["Ram", 1, 2000000, 21667, 73417, 95084, 1926583, 0.13, null],
  ["Ram", 2, 1926583, 20871, 74213, 95084, 1852370, 0.13, null],
  ["Ram", 3, 1852370, 20109, 74975, 95084, 1777395, 0.13, null],
  ["Ram", 4, 1777395, 19306, 75778, 95084, 1701617, 0.13, null],
  ["Ram", 5, 1701617, 18434, 76650, 95084, 1624967, 0.13, null],
  ["Ram", 6, 1624967, 17604, 77480, 95084, 1547487, 0.13, null],
  ["Ram", 7, 1547487, 16765, 78319, 95084, 1469168, 0.13, null],
  ["Ram", 8, 1469168, 15916, 79168, 95084, 1390000, 0.13, null],
  ["Ram", 9, 1390000, 15058, 80026, 95084, 1309974, 0.13, null],
  ["Ram", 10, 1309974, 14192, 80892, 95084, 1229082, 0.13, null],
  ["Ram", 11, 1229082, 13315, 81769, 95084, 1147313, 0.13, null],
  ["Ram", 12, 1147313, 12430, 82654, 95084, 1064659, 0.13, null],
  ["Ram", 13, 1064659, 11533, 83551, 95084, 981108, 0.13, null],
  ["Ram", 14, 981108, 10629, 84455, 95084, 896653, 0.13, 400],
  ["Ram", 15, 896653, 9714, 85370, 95084, 811283, 0.13, null],
  ["Ram", 16, 811283, 8789, 86295, 95084, 724988, 0.13, null],
  ["Ram", 17, 724988, 7854, 87230, 95084, 637758, 0.13, null],
  ["Ram", 18, 637758, 6909, 88175, 95084, 549583, 0.13, null],
  ["Ram", 19, 549583, 5954, 89130, 95084, 460453, 0.13, null],
  ["Ram", 20, 460453, 4988, 90096, 95084, 370357, 0.13, null],
  ["Ram", 21, 370357, 4020, 91064, 95084, 279293, 0.13, null],
  ["Ram", 22, 279293, 3026, 92058, 95084, 187235, 0.13, null],
  ["Ram", 23, 187235, 2029, 93055, 95084, 94180, 0.13, null],
  ["Ram", 24, 94180, 1020, 94064, 95084, 0, 0.13, null],
  ["Shyam", 1, 5500000, 32083, 76823, 108907, 5423177, 0.07, null],
  ["Shyam", 2, 5423177, 31635, 77271, 108907, 5345905, 0.07, null],
  ["Shyam", 3, 5345905, 31184, 77722, 108907, 5268183, 0.07, null],
  ["Shyam", 4, 5268183, 30731, 78176, 108907, 5190008, 0.07, null],
  ["Shyam", 5, 5190008, 30275, 78632, 108907, 5111376, 0.07, null],
  ["Shyam", 6, 5111376, 29816, 79090, 108907, 5032286, 0.07, null],
  ["Shyam", 7, 5032286, 29355, 79552, 108907, 4952734, 0.07, null],
  ["Shyam", 8, 4952734, 28891, 80016, 108907, 4872719, 0.07, null],
  ["Shyam", 9, 4872719, 28424, 80482, 108907, 4792236, 0.07, null],
  ["Shyam", 10, 4792236, 27955, 80952, 108907, 4711284, 0.07, null],
  ["Shyam", 11, 4711284, 27482, 81424, 108907, 4629860, 0.07, null],
  ["Shyam", 12, 4629860, 27008, 81899, 108907, 4547961, 0.07, null],
  ["Shyam", 13, 4547961, 26530, 82377, 108907, 4465584, 0.07, null],
  ["Shyam", 14, 4465584, 26049, 82857, 108907, 4382727, 0.07, null],
  ["Shyam", 15, 4382727, 25566, 83341, 108907, 4299386, 0.07, null],
  ["Shyam", 16, 4299386, 25080, 83827, 108907, 4215560, 0.07, null],
  ["Shyam", 17, 4215560, 24591, 84316, 108907, 4131244, 0.07, null],
  ["Shyam", 18, 4131244, 24099, 84808, 108907, 4046436, 0.07, null],
  ["Shyam", 19, 4046436, 23604, 85302, 108907, 3961134, 0.07, null],
  ["Shyam", 20, 3961134, 23107, 85800, 108907, 3875334, 0.07, null],
  ["Shyam", 21, 3875334, 22606, 86300, 108907, 3789033, 0.07, null],
  ["Shyam", 22, 3789033, 22103, 86804, 108907, 3702229, 0.07, null],
  ["Shyam", 23, 3702229, 21596, 87310, 108907, 3614919, 0.07, null],
  ["Shyam", 24, 3614919, 21087, 87820, 108907, 3527099, 0.07, null],
  ["Shyam", 25, 3527099, 20575, 88332, 108907, 3438768, 0.07, null],
  ["Shyam", 26, 3438768, 20059, 88847, 108907, 3349921, 0.07, null],
  ["Shyam", 27, 3349921, 19541, 89365, 108907, 3260555, 0.07, null],
  ["Shyam", 28, 3260555, 19020, 89887, 108907, 3170668, 0.07, null],
  ["Shyam", 29, 3170668, 18496, 90411, 108907, 3080257, 0.07, null],
  ["Shyam", 30, 3080257, 17968, 90938, 108907, 2989319, 0.07, null],
  ["Shyam", 31, 2989319, 17438, 91469, 108907, 2897850, 0.07, null],
  ["Shyam", 32, 2897850, 16904, 92002, 108907, 2805848, 0.07, null],
  ["Shyam", 33, 2805848, 16367, 92539, 108907, 2713308, 0.07, null],
  ["Shyam", 34, 2713308, 15828, 93079, 108907, 2620230, 0.07, null],
  ["Shyam", 35, 2620230, 15285, 93622, 108907, 2526608, 0.07, null],
  ["Shyam", 36, 2526608, 14739, 94168, 108907, 2432440, 0.07, null],
  ["Shyam", 37, 2432440, 14189, 94717, 108907, 2337722, 0.07, null],
  ["Shyam", 38, 2337722, 13637, 95270, 108907, 2242452, 0.07, null],
  ["Shyam", 39, 2242452, 13081, 95826, 108907, 2146627, 0.07, null],
  ["Shyam", 40, 2146627, 12522, 96385, 108907, 2050242, 0.07, null],
  ["Shyam", 41, 2050242, 11960, 96947, 108907, 1953295, 0.07, null],
  ["Shyam", 42, 1953295, 11394, 97512, 108907, 1855783, 0.07, null],
  ["Shyam", 43, 1855783, 10825, 98081, 108907, 1757702, 0.07, null],
  ["Shyam", 44, 1757702, 10253, 98653, 108907, 1659048, 0.07, null],
  ["Shyam", 45, 1659048, 9678, 99229, 108907, 1559820, 0.07, null],
  ["Shyam", 46, 1559820, 9099, 99808, 108907, 1460012, 0.07, null],
  ["Shyam", 47, 1460012, 8517, 100390, 108907, 1359622, 0.07, null],
  ["Shyam", 48, 1359622, 7931, 100975, 108907, 1258647, 0.07, null],
  ["Shyam", 49, 1258647, 7342, 101564, 108907, 1157082, 0.07, null],
  ["Shyam", 50, 1157082, 6750, 102157, 108907, 1054925, 0.07, null],
  ["Shyam", 51, 1054925, 6154, 102753, 108907, 952172, 0.07, null],
  ["Shyam", 52, 952172, 5554, 103352, 108907, 848820, 0.07, null],
  ["Shyam", 53, 848820, 4951, 103955, 108907, 744865, 0.07, null],
  ["Shyam", 54, 744865, 4345, 104562, 108907, 640303, 0.07, null],
  ["Shyam", 55, 640303, 3735, 105171, 108907, 535132, 0.07, null],
  ["Shyam", 56, 535132, 3122, 105785, 108907, 4, 0.07, null],
  ["Pranjali", 1, 500000, 2917, 48701, 51618, 451299, 0.07, null],
  ["Pranjali", 2, 451299, 2633, 48986, 51618, 402313, 0.07, null],
  ["Pranjali", 3, 402313, 2347, 49271, 51618, 353042, 0.07, null],
  ["Pranjali", 4, 353042, 2059, 49559, 51618, 303483, 0.07, null],
  ["Pranjali", 5, 303483, 1770, 49848, 51618, 253635, 0.07, null],
  ["Pranjali", 6, 253635, 2536, 49723, 52259, 203912, 0.12, null],
  ["Pranjali", 7, 203912, 2039, 50220, 52259, 153693, 0.12, null],
  ["Pranjali", 8, 153693, 1537, 50722, 52259, 102971, 0.12, null],
  ["Pranjali", 9, 102971, 1030, 51229, 52259, 51741, 0.12, null],
  ["Pranjali", 10, 51741, 517, 51741, 52259, 0, 0.12, null],
];

// Each row: [Person, Month, Opening, Interest, Principal, EMI, Closing, Rate]
const LOAN_BANK_ROWS = [
  ["Ram", 1, 2000000, 21667, 73417, 95084, 1926583, 0.13],
  ["Ram", 2, 1926583, 20871, 74213, 95084, 1852370, 0.13],
  ["Ram", 3, 1852370, 20109, 74975, 95084, 1777395, 0.13],
  ["Ram", 4, 1777395, 19306, 75778, 95084, 1701617, 0.13],
  ["Ram", 5, 1701617, 18434, 76650, 95084, 1624967, 0.13],
  ["Ram", 6, 1624967, 17604, 77480, 95084, 1547487, 0.13],
  ["Ram", 7, 1547487, 16765, 78319, 95084, 1469168, 0.13],
  ["Ram", 8, 1469168, 15916, 79168, 95084, 1390000, 0.13],
  ["Ram", 9, 1390000, 15058, 80026, 95084, 1309974, 0.13],
  ["Ram", 10, 1309974, 14192, 80892, 95084, 1229082, 0.13],
  ["Ram", 11, 1229082, 13315, 81769, 95084, 1147313, 0.13],
  ["Ram", 12, 1147313, 12430, 82654, 95084, 1064659, 0.13],
  ["Ram", 13, 1064659, 11533, 83551, 95084, 981108, 0.13],
  ["Ram", 14, 981108, 10629, 84455, 95084, 896653, 0.14],
  ["Ram", 15, 896653, 10000, 85370, 95084, 811283, 0.13],
  ["Ram", 16, 811283, 8789, 86295, 95084, 724988, 0.13],
  ["Ram", 17, 724988, 7854, 87230, 95084, 637758, 0.13],
  ["Ram", 18, 637758, 6909, 88175, 95084, 549583, 0.13],
  ["Ram", 19, 549583, 5954, 89130, 95084, 460453, 0.13],
  ["Ram", 20, 460453, 4988, 90096, 95084, 370357, 0.13],
  ["Ram", 21, 370357, 4020, 91064, 95084, 279293, 0.13],
  ["Ram", 22, 279293, 3026, 92058, 95084, 187235, 0.13],
  ["Ram", 23, 187235, 2029, 93055, 95084, 94180, 0.13],
  ["Ram", 24, 94180, 1020, 94064, 95084, 0, 0.13],
  ["Shyam", 1, 5500000, 32083, 76823, 108907, 5423177, 0.07],
  ["Shyam", 2, 5423177, 31635, 77271, 108907, 5345905, 0.07],
  ["Shyam", 3, 5345905, 31184, 77722, 108907, 5268183, 0.07],
  ["Shyam", 4, 5268183, 30731, 78176, 108907, 5190008, 0.07],
  ["Shyam", 5, 5190008, 30275, 78632, 108907, 5111376, 0.07],
  ["Shyam", 6, 5111376, 29816, 79090, 108907, 5032286, 0.07],
  ["Shyam", 7, 5032286, 29355, 79552, 108907, 4952734, 0.07],
  ["Shyam", 8, 4952734, 28891, 80016, 108907, 4872719, 0.07],
  ["Shyam", 9, 4872719, 28424, 80482, 108907, 4792236, 0.07],
  ["Shyam", 10, 4792236, 27955, 80952, 108907, 4711284, 0.07],
  ["Shyam", 11, 4711284, 27482, 81424, 108907, 4629860, 0.07],
  ["Shyam", 12, 4629860, 27008, 81899, 108907, 4547961, 0.07],
  ["Shyam", 13, 4547961, 26530, 82377, 108907, 4465584, 0.07],
  ["Shyam", 14, 4465584, 26049, 82857, 108907, 4382727, 0.07],
  ["Shyam", 15, 4382727, 25566, 83341, 108907, 4299386, 0.07],
  ["Shyam", 16, 4299386, 25080, 83827, 108907, 4215560, 0.07],
  ["Shyam", 17, 4215560, 24591, 84316, 108907, 4131244, 0.07],
  ["Shyam", 18, 4131244, 24099, 84808, 108907, 4046436, 0.07],
  ["Shyam", 19, 4046436, 23604, 85302, 108907, 3961134, 0.07],
  ["Shyam", 20, 3961134, 23107, 85800, 108907, 3875334, 0.07],
  ["Shyam", 21, 3875334, 22606, 86300, 108907, 3789033, 0.07],
  ["Shyam", 22, 3789033, 22103, 86804, 108907, 3702229, 0.07],
  ["Shyam", 23, 3702229, 21596, 87310, 108907, 3614919, 0.07],
  ["Shyam", 24, 3614919, 21087, 87820, 108907, 3527099, 0.07],
  ["Shyam", 25, 3527099, 20575, 88332, 108907, 3438768, 0.07],
  ["Shyam", 26, 3438768, 20059, 88847, 108907, 3349921, 0.07],
  ["Shyam", 27, 3349921, 19541, 89365, 108907, 3260555, 0.07],
  ["Shyam", 28, 3260555, 19020, 89887, 108907, 3170668, 0.07],
  ["Shyam", 29, 3170668, 18496, 90411, 108907, 3080257, 0.07],
  ["Shyam", 30, 3080257, 17968, 90938, 108907, 2989319, 0.07],
  ["Shyam", 31, 2989319, 17438, 91469, 108907, 2897850, 0.07],
  ["Shyam", 32, 2897850, 16904, 92002, 108907, 2805848, 0.07],
  ["Shyam", 33, 2805848, 16367, 92539, 108907, 2713308, 0.07],
  ["Shyam", 34, 2713308, 15828, 93079, 108907, 2620230, 0.07],
  ["Shyam", 35, 2620230, 15285, 93622, 108907, 2526608, 0.07],
  ["Shyam", 36, 2526608, 14739, 94168, 108907, 2432440, 0.07],
  ["Shyam", 37, 2432440, 14189, 94717, 108907, 2337722, 0.07],
  ["Shyam", 38, 2337722, 13637, 95270, 108907, 2242452, 0.07],
  ["Shyam", 39, 2242452, 13081, 95826, 108907, 2146627, 0.07],
  ["Shyam", 40, 2146627, 12522, 96385, 108907, 2050242, 0.07],
  ["Shyam", 41, 2050242, 11960, 96947, 108907, 1953295, 0.07],
  ["Shyam", 42, 1953295, 11394, 97512, 108907, 1855783, 0.07],
  ["Shyam", 43, 1855783, 10825, 98081, 108907, 1757702, 0.07],
  ["Shyam", 44, 1757702, 10253, 98653, 108907, 1659048, 0.07],
  ["Shyam", 45, 1659048, 9678, 99229, 108907, 1559820, 0.07],
  ["Shyam", 46, 1559820, 9099, 99808, 108907, 1460012, 0.07],
  ["Shyam", 47, 1460012, 8517, 100390, 108907, 1359622, 0.07],
  ["Shyam", 48, 1359622, 7931, 100975, 108907, 1258647, 0.07],
  ["Shyam", 49, 1258647, 7342, 101564, 108907, 1157082, 0.07],
  ["Shyam", 50, 1157082, 6750, 102157, 108907, 1054925, 0.07],
  ["Shyam", 51, 1054925, 6154, 102753, 108907, 952172, 0.07],
  ["Shyam", 52, 952172, 5554, 103352, 108907, 848820, 0.07],
  ["Shyam", 53, 848820, 4951, 103955, 108907, 744865, 0.07],
  ["Shyam", 54, 744865, 4345, 104562, 108907, 640303, 0.07],
  ["Shyam", 55, 640303, 3735, 105171, 108907, 535132, 0.07],
  ["Shyam", 56, 535132, 3122, 105785, 108907, 4, 0.07],
  ["Pranjali", 1, 500000, 2917, 48701, 51618, 451299, 0.07],
  ["Pranjali", 2, 451299, 2633, 48986, 51618, 402313, 0.07],
  ["Pranjali", 3, 402313, 2347, 49271, 51618, 353042, 0.07],
  ["Pranjali", 4, 353042, 2059, 49559, 51618, 303483, 0.07],
  ["Pranjali", 5, 303483, 1770, 49848, 51618, 253635, 0.07],
  ["Pranjali", 6, 253635, 3000, 49723, 52259, 203912, 0.12],
  ["Pranjali", 7, 203912, 2039, 50220, 52259, 153693, 0.12],
  ["Pranjali", 8, 153693, 1537, 50722, 52259, 102971, 0.12],
  ["Pranjali", 9, 102971, 1030, 51229, 52259, 51741, 0.12],
  ["Pranjali", 10, 51741, 517, 51741, 52259, 0, 0.12],
];

// Diff rows aligned 1:1 with LOAN_CALC_ROWS
// [OpeningDiff, InterestDiff, PrincipalDiff, EMIDiff, ClosingDiff, RateDiff]
const LOAN_DIFF_ROWS = [
  [0, null, null, null, null, null],
  ...Array(12).fill(null).map(() => [null, null, null, null, null, null]),
  [null, null, null, null, null, 0.01],
  [null, 286, null, null, null, null],
  ...Array(67).fill(null).map(() => [null, null, null, null, null, null]),
  [null, 464, null, null, null, null],
  ...Array(4).fill(null).map(() => [null, null, null, null, null, null]),
];

// ─────────────────────────────────────────────────────────────
// KYC CHECKS  (demo — currently a static display page)
// ─────────────────────────────────────────────────────────────

const KYC_TABLES = [
  {
    id: 'kyc_pan_aadhaar_not_matching',
    title: 'PAN & Aadhaar not matching',
    desc: "Customers whose PAN and Aadhar records don't match",
    headers: ['Customer', 'Not Matching KYC'],
    rows: [
      ['Rohan Deshmukh', 'PAN vs Aadhar name mismatch'],
      ['Sneha Patil', 'Aadhar DOB mismatch'],
      ['Shanaya Shaikh', 'PAN vs Aadhar name mismatch'],
      ['Kavita Joshi', 'Aadhar address mismatch'],
      ['Veer Nair', 'PAN number invalid format'],
      ['Ayesha Khan', 'Aadhar photo mismatch'],
    ],
  },
  {
    id: 'kyc_last_kyc_updated',
    title: 'Last KYC updated',
    desc: 'Years since last KYC refresh, by priority',
    headers: ['Customer Name', 'Years', 'Priority'],
    rows: [
      ['Rohan Joshi', '10', 'Medium'],
      ['Sneha Patra', '12', 'High'],
      ['Ushma Sewani', '5', 'Medium'],
      ['Kavita Varma', '8', 'Medium'],
      ['Arnav Nair', '2', 'Low'],
      ['Ayesha Nair', '12', 'High'],
    ],
  },
  {
    id: 'kyc_missing_kyc',
    title: 'Missing KYC',
    desc: 'Customers KYC document absent from the system',
    headers: ['Customer Name', 'Name of Missing ID', 'Priority'],
    rows: [
      ['Imran Shaikh', 'PAN', 'High'],
      ['Sneha Patil', 'Aadhar', 'High'],
      ['Aanya Chhatwani', 'ITR Copy', 'Medium'],
      ['Khyati Joshi', 'Nominee Details', 'Low'],
      ['Vikram Nair', 'Aadhar', 'High'],
      ['Irfan Khan', 'PAN', 'High'],
    ],
  },
  {
    id: 'kyc_vkyc',
    title: 'VKYC',
    desc: 'Flags raised during the Video KYC process',
    headers: ['Customer Name', 'Issue'],
    rows: [
      ['Rohan Deshmukh', 'Photo not matching video'],
      ['Sana Sharma', 'PAN not matching'],
      ['Isha Rathi', 'PAN missing'],
      ['Pranjal Satav', 'Aadhar missing'],
      ['Vikram Nair', 'Video call disconnected mid-session'],
      ['Palak Ardeja', 'Address not matching video'],
    ],
  },
  {
    id: 'kyc_document_not_uploaded',
    title: 'Document Not Uploaded',
    desc: 'Customers with a KYC document type absent from the system',
    headers: ['Customer Name', 'Document', 'Priority'],
    rows: [
      ['Sunaina Deshmukh', 'PAN, Aadhar', 'High'],
      ['Siksha Patil', 'ITR Copy', 'Medium'],
      ['Irad Shaikh', 'PAN', 'High'],
      ['Kalyani Kher', 'Aadhar', 'High'],
      ['Vikram Nair', 'PAN, ITR Copy', 'High'],
      ['Aanya Verma', 'Nominee Details', 'Low'],
    ],
  },
  {
    id: 'kyc_duplicate_aadhar_usage',
    title: 'Duplicate Aadhar Usage',
    desc: 'Same Aadhar number linked to multiple customer records',
    headers: ['Aadhar Number', 'Number'],
    rows: [
      ['XXXX-XXXX-4821', '7'],
      ['XXXX-XXXX-6034', '4'],
      ['XXXX-XXXX-7719', '2'],
      ['XXXX-XXXX-2280', '2'],
      ['XXXX-XXXX-9145', '1'],
      ['XXXX-XXXX-3367', '1'],
    ],
  },
  {
    id: 'kyc_duplicate_pan_usage',
    title: 'Duplicate PAN Usage',
    desc: 'Same PAN number linked to multiple customer records',
    headers: ['PAN Number', 'Number'],
    rows: [
      ['ABCPD1234E', '7'],
      ['QWERT5678F', '4'],
      ['LMNOP9012G', '2'],
      ['ZXCVB3456H', '2'],
      ['HGFED7890J', '1'],
      ['TYUIO2345K', '1'],
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// OTHER LOAN DETAILS  (demo — currently a static display page)
// ─────────────────────────────────────────────────────────────

const LOAN_TABLES = [
  {
    id: 'loan_pending_npa_classification',
    title: 'NPA Account Not Marked As NPA Days',
    desc: 'Days overdue on accounts not yet flagged as NPA',
    headers: ['Customer', 'NPA Days'],
    rows: [
      ['Annanya Nagrik', '50'], ['Nikita Chim', '40'],
      ['Akshada Dongre', '33'], ['Harshita Ganwani', '45'],
      ['Vikram Nair', '21'], ['Manjiri Dhoran', '30'],
    ],
  },
  {
    id: 'loan_sanction_letter_deviation',
    title: 'Loan Details in Actual VS Sanction letter',
    desc: 'Actual disbursed terms compared against sanction letter terms',
    headers: ['Customer', 'Actual', 'Sanction'],
    rows: [
      ['Sarvesh Magad', '\u20b910 Cr', '\u20b99 Cr'],
      ['Tanmay Warkad', '13% rate of interest', '12% rate of interest'],
      ['Imran Shaikh', 'EMI \u20b92,000', 'EMI \u20b91,000'],
      ['Tanush Ruchwani', 'Principal amount \u20b91.05 Cr', 'Principal amount \u20b91.02 Cr'],
      ['Veer Varma', '\u20b96.5 Cr', '\u20b96 Cr'],
      ['Ayesha Khan', '14% rate of interest', '12.5% rate of interest'],
    ],
  },
  {
    id: 'loan_approval_breaches',
    title: 'Loan Sanction To People Above Limit',
    desc: "Sanctions approved beyond the approver's authorised limit",
    headers: ['Loan Approval Person', 'Above Limit'],
    numStyle: true,
    rows: [
      ['Ramesh Kulkarni', '15 Cr'], ['Sita Rane', '20 Cr'],
      ['Anil Verma', '25 Cr'], ['Priya Menon', '12 Cr'],
      ['Suresh Iyer', '18 Cr'], ['Neha Kapoor', '22 Cr'],
    ],
  },
  {
    id: 'loan_multi_loan_exposure',
    title: 'Multiple Loan Account Of Same Person',
    desc: 'Customers holding more than one active loan account',
    headers: ['Customer', 'Loan Number'],
    numStyle: true,
    rows: [
      ['Rohan Deshmukh', '7'], ['Vinti Patil', '5'],
      ['Sobiya Shaikh', '3'], ['Khyati Joshi', '4'],
      ['Tanmay Sharma', '2'], ['Arva Khan', '3'],
    ],
  },
  {
    id: 'loan_restructured_accounts',
    title: 'Restructuring Of Loan',
    desc: 'Loans restructured and the revised repayment duration',
    headers: ['Customer', 'Loan Number', 'Duration of Loan'],
    rows: [
      ['Rohit Khira', '9', '10 years'], ['Siksha Patil', '8', '9 years'],
      ['Imran Shaikh', '6', '7 years'], ['Kalki Jhaveri', '9', '8 years'],
      ['Vikram Nair', '4', '12 years'], ['Virmala Verma', '5', '6 years'],
    ],
  },
  {
    id: 'loan_joint_venture_account_entries',
    title: 'JV entries In loan Account',
    desc: 'Number of times manual intervention done in acc',
    headers: ['Customer', 'Entry', 'Amount Involved'],
    rows: [
      ['Rohan Deshmukh', '3', '90,000'], ['Sneha Patil', '4', '31,000'],
      ['Imran Shaikh', '9', '20,000'], ['Kavita Joshi', '7', '50,000'],
      ['Vikram Nair', '7', '69,000'], ['Ayesha Khan', '3', '45,000'],
    ],
  },
];