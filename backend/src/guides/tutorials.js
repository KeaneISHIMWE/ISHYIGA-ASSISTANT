/**
 * Official Ishyiga YouTube tutorials.
 * Matched to client questions by keyword score; recommended with guide steps.
 */
const TUTORIALS = [
  {
    id: "pos-caisse-invoice",
    title: "How to make an invoice in Ishyiga POS Caisse",
    url: "https://youtu.be/FxfH40jzBng",
    keywords: [
      "invoice",
      "facture",
      "caisse",
      "sale",
      "sales",
      "sell",
      "pos caisse",
      "make invoice",
      "create invoice",
      "vendre",
      "vente",
    ],
    steps: [
      "Open Ishyiga POS Caisse",
      "Select the Sales button",
      "Enter your ID and password, then click Login",
      "After login, select the item you want to sell and click Sale",
      "Complete the invoice",
      "View the report by clicking the DATA button",
    ],
  },
  {
    id: "erp-manchester-order-invoice",
    title:
      "How to make an order in Ishyiga Manchester and transform it into an invoice",
    url: "https://www.youtube.com/watch?v=GMuTfTH02kg",
    keywords: [
      "manchester",
      "manschesta",
      "make order",
      "transform order",
      "order into invoice",
      "delivery to invoice",
      "savedelivery",
      "save delivery",
      "delivery-invoice",
      "wholesale",
      "wholesaler",
      "ishyiga erp manchester",
      "ishyiga manchester",
    ],
    steps: [
      "Open Ishyiga Manchester",
      "Enter your credentials",
      "Choose your menu (the video also selects tariff GROSSISTE on ALL TARIFF)",
      "Select items",
      "Put the quantity needed, then click ADD (window V_QUANTITY TAKING)",
      "Click DELIVERY",
      "Choose table, then Yes",
      "Click SAVEDELIVERY, then Yes",
      "Print or save as PDF (the video saves the file as ORDER)",
      "Open Ishyiga ERP",
      "Choose employee",
      "Open the sales screen with setting DELIVERY-INVOICE, then click DELIVERY-INVOICE",
      "Click OK for CASH or CREDIT",
      "Choose payment type, then SAVE DELIVERY-INVOICE, then Yes",
      "Print or save as PDF (the video saves the file as DELIVERY TO INVOICE)",
    ],
  },
  {
    id: "erp-software-overview",
    title: "ISHYIGA ERP Software",
    url: "https://www.youtube.com/watch?v=H3E8_87hOow",
    keywords: [
      "ishyiga erp",
      "erp software",
      "erp main gate",
      "new item creation",
      "purchase interface",
      "top client",
      "top sales",
      "generating proforma",
      "z daily report",
      "ns grossiste",
    ],
    steps: [
      "Open Ishyiga ERP MAIN GATE. Click Purchases to open the stock interface. Enter ID and PWD",
      "Use the Sales Management Interface",
      "New item creation: fill the form data, then click ADD",
      "Supplier: fill supplier information, then click ADD",
      "Stock / purchase: enter purchase price, search VIEW EVENTS and press it, add lines with ADD / REMOVE / COST, then OK",
      "SELECT ALL PRODUCT, then OK. Enter reference number and invoice number",
      "Statistics Report: Top Sales, Top Client, Top Employee",
      "Sales OPTIONS: Current or All, then Click Ok",
      "Create a client: fill the form, then click SAVE",
      "Generating Proforma: select the warehouse, select client, enter the needed quantity, fill the proforma, then SAVE PROFORMA",
      "Invoice: choose payment type, SAVE INVOICE, then confirm Yes",
      "Select the option and press Enter. Open Z DAILY REPORT for sales and NS grossiste",
    ],
  },
  {
    id: "erp-global-item-purchase-report",
    title: "Global Item Purchase Report in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=wkl5mZvHTG4",
    keywords: [
      "global item purchase",
      "global item purchases",
      "item purchases",
      "qty pur",
      "qty live",
      "average pr",
      "livraison count",
      "purchase history erp",
    ],
    steps: [
      "Open Ishyiga ERP MAIN GATE",
      "Click on Purchases",
      "Enter your credentials (ID and PWD)",
      "Search Delivery",
      "Select Global Item Purchases",
      "Enter Date Interval (current month end / end date), then OK",
      "The report shows item purchases with QTY PUR, QTY LIVE, AVERAGE PR, and Delivery/Livraison Count",
    ],
  },
  {
    id: "erp-sales-rra-format-detail",
    title: "Sales Report in RRA FORMAT DETAIL via ERP",
    url: "https://www.youtube.com/watch?v=vHzCACSW9gM",
    keywords: [
      "rra format",
      "format rra",
      "rra detail",
      "sales report rra",
      "les donnees",
      "les données",
    ],
    steps: [
      "Open Ishyiga ERP MAIN GATE",
      "Press Sales",
      "Enter ID (and password), then OK",
      "Select DATA or LES DONNÉES and press it",
      "Open RAPPORT",
      "Options: FORMAT RRA DETAIL, then press OK",
      "The report shows totals and TVA (EXPORT FILE)",
    ],
  },
  {
    id: "pos-x-z-report",
    title: "X AND Z REPORT IN ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=zaWdEwZlkO4",
    keywords: [
      "x and z report",
      "x report pos",
      "z report pos",
      "pos maingate",
      "mrc report",
    ],
    steps: [
      "Open POS MAINGATE",
      "Login sales by entering your credentials",
      "Click DATA, then REPORT",
      "Select X REPORT",
      "OPTIONS: MRC, then OK",
      "Enter date",
      "Choose ALL (or the shown option), then OK",
      "Select Z REPORT if you want to view the report for a given period, then enter END TIME",
    ],
  },
  {
    id: "pos-plu-report",
    title: "PLU REPORT IN ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=EeuZO4yIYJQ",
    keywords: [
      "plu report",
      "plu",
      "rra report pos",
      "sold qty",
      "taxrate",
    ],
    steps: [
      "Click DATA",
      "REPORT -> RRA REPORT",
      "Choose PLU REPORT",
      "Enter period",
      "Check Name, taxrate, sold qty, stock qty, unity price, total price",
    ],
  },
  {
    id: "pos-save-open-draft",
    title: "SAVE AND OPEN DRAFT IN ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=U_0pptCopPs",
    keywords: [
      "save draft",
      "open draft",
      "draft pos",
      "doing facture",
    ],
    steps: [
      "Save a draft: select product (Enter qty), Click DRAFT, Insert name of Client, Click OKEY",
      "Open a draft: Click DRAFT, SELECT OPEN DRAFT, CHECK WELL ALL PRODUCT (CLICK OKEY)",
      "DOING FACTURE (click cash, enter total amount, choose client, click okey until sending facture)",
    ],
  },
  {
    id: "erp-printout-purchase",
    title: "Printout Purchase in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=DMbBOwxAO3E",
    keywords: [
      "printout purchase",
      "facturerra",
      "page setup purchase",
      "printout purchases",
    ],
    steps: [
      "Open ERP MAINGATE",
      "Open purchases, enter ID / PASSWORD",
      "Open PAGE SETUP",
      "Select articles like FACTURERRA",
      "Change the setting, then Click update",
    ],
  },
  {
    id: "erp-printout-sales",
    title: "Printout Sales in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=khI_5w6uM0U",
    keywords: [
      "printout sales",
      "page setup sales",
      "page setup facture",
    ],
    steps: [
      "Open sales -> click Data",
      "Click page setup",
      "Select Facture",
      "Setting size of articles",
      "Click to Update",
    ],
  },
  {
    id: "pos-ihute",
    title: "IHUTE in ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=GgMcrHjvdyM",
    keywords: [
      "ihute pos",
      "ihute",
      "momo code",
      "trading pos",
    ],
    steps: [
      "Enter credentials, LOGIN",
      "Click TRADING",
      "Fill Company Information (Name, TIN, Phone, Momo Code, Owner, Email, Sector, Location, Ishyiga Account, Delivery Mode)",
      "Submit",
    ],
  },
  {
    id: "erp-ihute",
    title: "IHUTE in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=RDfFhvvWhdM",
    keywords: [
      "ihute erp",
      "v_trading",
      "v trading",
    ],
    steps: [
      "Search trading, press V_TRADING",
      "Fill the company form",
      "Enter phone",
      "Enter email company",
      "Submit",
    ],
  },
  {
    id: "erp-calcul-poids",
    title: "CALCUL in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=h6vKSrbatpk",
    keywords: [
      "calcul",
      "mode de calcul",
      "categorie tarifaire",
      "catégorie tarifaire",
      "poids",
      "foreign currencies",
      "total cost",
    ],
    steps: [
      "Open MAINGATE and enter credentials",
      "Open Purchases / DELIVERY",
      "Add items / batch",
      "Click CALCUL",
      "MODE DE CALCUL CATEGORIE TARIFAIRE",
      "Select poids",
      "Click calcul and Save",
    ],
  },
  {
    id: "pos-view-proforma-report",
    title: "View Proforma Report in ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=0NIqNfVYUyU",
    keywords: [
      "view proforma report",
      "proforma report pos",
      "select proforma",
    ],
    steps: [
      "Click DATA / REPORT",
      "SELECT PROFORMA THEN OKAY",
    ],
  },
  {
    id: "pos-make-proforma-report",
    title: "Make PROFORMA AND Viewing PROFORMA REPORT IN ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=_nd9g8cEIY0",
    keywords: [
      "make proforma pos",
      "working proforma",
      "proforo",
      "proforma button",
      "viewing proforma report",
    ],
    steps: [
      "Click proforma button",
      "Continue to click new -> OK",
      "Search Item",
      "Click Proforma",
      "Enter client name",
      "Enter reference, press ok",
      "Click DATA button",
      "Go to Report, search PROFORMA",
      "Select ALL, Press OK",
    ],
  },
  {
    id: "erp-x-report",
    title: "X REPORT in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=mfLuAl81GIQ",
    keywords: [
      "x report erp",
      "option x report",
      "start time x report",
    ],
    steps: [
      "GO TO OPTION",
      "CLICK ON X REPORT",
      "START TIME, then OK",
      "YOU MAY PRINT OR SAVE AS PDF",
    ],
  },
  {
    id: "pos-return-delivery-stock",
    title: "Return / Refund Delivery Stock in ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=sIWapdZnfZU",
    keywords: [
      "return delivery",
      "refund delivery",
      "canceling delivery",
      "cancelling delivery",
      "inv.supplier",
      "inv supplier",
    ],
    steps: [
      "CLICK INV.SUPPLIER",
      "Open the delivery list",
      "ENTER REASON FOR CANCELING DELIVERY",
      "Check report if done successfully: OPTIONS DATE",
    ],
  },
  {
    id: "pos-view-delivery-report",
    title: "View Delivery Report in ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=2Oo1XC9tatQ",
    keywords: [
      "view delivery report",
      "delivery report pos",
      "inv.supplier date",
    ],
    steps: [
      "CLICK ON INV.SUPPLIER",
      "FOR DATE: starting and ending date",
    ],
  },
  {
    id: "erp-z-daily-report",
    title: "Z Report / Daily Report in ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=gFZGRSB6IfA",
    keywords: [
      "z report erp",
      "z_report",
      "z daily report pdf",
      "options z_report",
    ],
    steps: [
      "OPTIONS Z_REPORT",
      "Select option, press Enter",
      "Open Z DAILY REPORT PDF",
    ],
  },
  {
    id: "compta-create-supplier",
    title: "Create New Supplier in Ishyiga Compta",
    url: "https://www.youtube.com/watch?v=c_fHBMoxgKQ",
    keywords: [
      "create new supplier",
      "ishyiga compta",
      "compta supplier",
      "click tier",
      "tier supplier",
    ],
    steps: [
      "Click Tier",
      "Complete the form",
      "Devise: any currency",
      "Click save",
    ],
  },
  {
    id: "umusada-system",
    title: "UMUSADA SYSTEM - Ishyiga Software",
    url: "https://www.youtube.com/watch?v=YNZppWjYEAM",
    keywords: [
      "umusada system",
      "umusada",
      "invoice financing",
      "working capital",
      "umusada.com",
    ],
    steps: [
      "Umusada invoice financing unlocks cash using your business data: no physical collateral, quick decisions, simple process",
      "Website: https://umusada.com/ — contact shown on the video: 0798687932",
      "Menus shown: Dashboard, Business Profile, Products, Orders, Sales, Purchases, Inventory, Loans, Financial Records",
      "Complete Your Business Profile / Complete Profile",
      "On-screen: Invoice Financing. Get Loan Now. Get a Faster, Fairer Loan Decision. No Traditional Credit Checks",
    ],
  },
  {
    id: "umusada-guide",
    title: "Umusada Guide - Ishyiga Software",
    url: "https://www.youtube.com/watch?v=8PfqLUtEOmU",
    keywords: [
      "umusada guide",
      "umusada login",
      "umusada.com",
      "join us umusada",
      "request loan",
      "add director umusada",
    ],
    steps: [
      "Open Your Browser (Chrome)",
      'Search "Umusada.com"',
      "Open join-us (Welcome — Join us to access your business dashboard)",
      "Fill Email Address, First Name, Last Name, Business TIN (9 digits), Phone Number registered with your business, Password (minimum 8 characters)",
      "N.B: TIN must be match with Phone number (RDB Certificate)",
      "Login with same Email and Password (Welcome Back). Sign in, or Sign in with Google",
      'Open Business Profile. Click on "Add Attachment" to Upload your Business Document (PDF, Word, or Excel, max 5MB)',
      'Click on "Add Director" to Add your Directors, then Add Director',
      'Click on "Add Account" to Add your Bank Account (Financial Institution, Account Name, Account Number, Business ID)',
      "Open Loans. Request New Loan: Financial Institution, Loan Type (General Loan or Invoice Financing), Loan Amount (RWF) (video shows Minimum: RWF 50,000), Purpose, Request Loan",
    ],
  },
  {
    id: "erp-supplier-list",
    title: "To See Supplier List in ERP",
    url: "https://www.youtube.com/watch?v=jpjPOUoyrww",
    keywords: [
      "supplier list",
      "v_supplier_list",
      "see supplier list",
      "les frss",
    ],
    steps: [
      "Search SUPPLIER LIST (V_SUPPLIER_LIST) and click on it",
      "The supplier list window opens (Les Frss)",
    ],
  },
  {
    id: "pos-local-command",
    title: "LOCAL COMMAND IN ISHYIGA POS",
    url: "https://www.youtube.com/watch?v=AMI6PLDUMis",
    keywords: [
      "local command",
      "pos cmd",
      "cmd button",
      "local commande",
    ],
    steps: [
      "Click on POS MAINGATE",
      "Open POS CMD by entering your credentials",
      "Click on CMD button",
      "Enter the quantity",
      "Click on send button and Enter the supplier name",
      "Save as PDF (the video saves the file as BC)",
    ],
  },
  {
    id: "erp-view-event-item",
    title: "VIEW EVENT OF ITEM IN ERP",
    url: "https://www.youtube.com/watch?v=J80jR5tEdTI",
    keywords: [
      "view event",
      "view events",
      "item view event",
      "view event of item",
    ],
    steps: [
      "Search the item you to make view event",
      "Search the view event and press it (VIEW EVENTS)",
    ],
  },
  {
    id: "erp-stock-family-opening-closing",
    title:
      "How to View OPENING, CLOSING and SOLD STOCK based on FAMMILY (Category) IN ERP",
    url: "https://www.youtube.com/watch?v=WNUGo29PRxE",
    keywords: [
      "opening closing sold stock",
      "sold stock family",
      "by famille",
      "v_stok",
      "fammily",
      "famille category",
    ],
    steps: [
      "Search STOCK function (V_STOK) and choose BY FAMILLE",
      "Choose DEPOT and then go to FAMILLE",
      "The report shows CODE, ITEM, START, LIVE, SOLD, PMP",
    ],
  },
  {
    id: "erp-plu-report",
    title: "PLU REPORT IN ISHYIGA ERP",
    url: "https://www.youtube.com/watch?v=BytUjjC1suI",
    keywords: [
      "plu report",
      "plu report erp",
      "plu report in ishyiga erp",
      "plue report",
    ],
    steps: [
      "Press the option (OPTIONS)",
      "Select the plue report (PLU REPORT) and press it",
      "Enter starting date (START TIME)",
      "Select the print if you want to print or to save pdf",
    ],
  },
  {
    id: "printout-settings",
    title: "Printout settings (commands, facture, delivery)",
    url: "https://youtu.be/-2YGmoCTcUA",
    keywords: [
      "printout",
      "print",
      "printer",
      "settings",
      "commande",
      "command",
      "facture",
      "delivery",
      "livraison",
      "impression",
      "imprimer",
    ],
    steps: [],
  },
  {
    id: "pos-mini-refund",
    title: "Make a refund in POS Mini",
    url: "https://youtube.com/shorts/vvmCEhABg90",
    keywords: [
      "refund",
      "return",
      "remboursement",
      "retour",
      "pos mini",
      "mini",
    ],
    steps: [],
  },
  {
    id: "pos-mini-proforma",
    title: "Make a proforma in POS Mini",
    url: "https://youtube.com/shorts/MTxV6tOKcpE",
    keywords: [
      "proforma",
      "pro forma",
      "devis",
      "quotation",
      "quote",
      "pos mini",
      "mini",
    ],
    steps: [],
  },
  {
    id: "pos-mini-purchase-report",
    title: "Purchase report in POS Mini",
    url: "https://youtube.com/shorts/jBCZhT-P51M",
    keywords: [
      "purchase report",
      "purchase",
      "achat",
      "rapport",
      "report",
      "buying",
      "pos mini",
      "mini",
    ],
    steps: [],
  },
  {
    id: "pos-mini-create-supplier",
    title: "Create a supplier in POS Mini",
    url: "https://youtube.com/shorts/7Ayt4b9lsNw",
    keywords: [
      "supplier",
      "fournisseur",
      "create supplier",
      "add supplier",
      "vendor",
      "pos mini",
      "mini",
    ],
    steps: [],
  },
  {
    id: "pos-mini-add-item",
    title: "Add a new item in POS Mini",
    url: "https://youtube.com/shorts/VhPoQGZxctI",
    keywords: [
      "add item",
      "new item",
      "product",
      "article",
      "ajouter",
      "produit",
      "catalogue",
      "pos mini",
      "mini",
    ],
    steps: [],
  },
];

function normalizeQuery(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTutorial(query, tutorial) {
  const q = normalizeQuery(query);
  if (!q) {
    return 0;
  }

  let score = 0;
  for (const keyword of tutorial.keywords) {
    const needle = keyword.toLowerCase();
    if (q.includes(needle)) {
      score += needle.split(/\s+/).length >= 2 ? 3 : 2;
    }
  }

  const titleWords = normalizeQuery(tutorial.title)
    .split(/\s+/)
    .filter((word) => word.length > 3);
  for (const word of titleWords) {
    if (q.includes(word)) {
      score += 1;
    }
  }

  return score;
}

function matchTutorials(query, { limit = 2, minScore = 3 } = {}) {
  return TUTORIALS.map((tutorial) => ({
    ...tutorial,
    score: scoreTutorial(query, tutorial),
  }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function formatTutorialContext(tutorials) {
  if (!Array.isArray(tutorials) || tutorials.length === 0) {
    return "";
  }

  const blocks = tutorials.map((tutorial, index) => {
    const lines = [
      `[Tutorial ${index + 1}] ${tutorial.title}`,
      `YouTube: ${tutorial.url}`,
    ];
    if (Array.isArray(tutorial.steps) && tutorial.steps.length > 0) {
      lines.push("Approved steps:");
      tutorial.steps.forEach((step, stepIndex) => {
        lines.push(`${stepIndex + 1}. ${step}`);
      });
    }
    return lines.join("\n");
  });

  return `MATCHED VIDEO TUTORIALS:\n${blocks.join("\n\n")}`;
}

function listAllTutorialsBrief() {
  return TUTORIALS.map((tutorial) => `- ${tutorial.title}: ${tutorial.url}`).join(
    "\n"
  );
}

module.exports = {
  TUTORIALS,
  matchTutorials,
  formatTutorialContext,
  listAllTutorialsBrief,
};
