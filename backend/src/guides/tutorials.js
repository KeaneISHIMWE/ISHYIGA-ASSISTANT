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
