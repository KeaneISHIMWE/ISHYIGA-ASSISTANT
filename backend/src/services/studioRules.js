const TYPES = [
  "SYSTEM_PROMPT",
  "QUESTION_ANSWER",
  "FEATURE_WORKFLOW",
  "TROUBLESHOOTING",
];

const STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "NEEDS_REVISION",
  "ADDED_TO_AI",
];

const REVIEW_ACTIONS = {
  approve: "APPROVED",
  reject: "REJECTED",
  revision: "NEEDS_REVISION",
  review: "UNDER_REVIEW",
};

function clean(value, max = 4000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, max);
}

function validateRegistration(body = {}) {
  const name = clean(body.name, 120);
  const email = clean(body.email, 180).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const phone = clean(body.phone, 40);
  if (name.length < 2) {
    return "Name must be at least 2 characters";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "A valid email is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return {
    name,
    email,
    password,
    phone: phone || null,
  };
}

function decideRole(userCount) {
  return Number(userCount) === 0 ? "ADMIN" : "CONTRIBUTOR";
}

function validateContribution(body = {}, { partial = false } = {}) {
  const type = String(body.type || "").trim();
  if (!TYPES.includes(type) && !partial) {
    return "Choose a contribution type";
  }

  const record = {
    type,
    title: clean(body.title, 180),
    question: clean(body.question, 4000) || null,
    answer: clean(body.answer, 8000) || null,
    systemPrompt: clean(body.systemPrompt || body.system_prompt, 12000) || null,
    feature: clean(body.feature, 180) || null,
    module: clean(body.module, 180) || null,
    description: clean(body.description, 8000) || null,
    steps: clean(body.steps, 8000) || null,
    symptoms: clean(body.symptoms, 4000) || null,
    cause: clean(body.cause, 4000) || null,
    solution: clean(body.solution, 8000) || null,
    escalateWhen: clean(body.escalateWhen || body.escalate_when, 2000) || null,
    priority: clean(body.priority, 40) || null,
    notes: clean(body.notes, 4000) || null,
    attachmentNote: clean(body.attachmentNote || body.attachment_note, 900000) || null,
    encountered: clean(body.encountered, 4000) || null,
  };

  if (!record.title) {
    return "Title is required";
  }

  if (type === "SYSTEM_PROMPT" && !record.systemPrompt) {
    return "System prompt is required";
  }
  if (type === "QUESTION_ANSWER" && (!record.question || !record.answer)) {
    return "Question and answer are required";
  }
  if (type === "FEATURE_WORKFLOW" && (!record.description || !record.steps)) {
    return "Description and step-by-step procedure are required";
  }
  if (type === "TROUBLESHOOTING" && (!record.question || !record.solution)) {
    return "Problem and solution are required";
  }
  if (!record.encountered) {
    return "Describe the question or problem you are trying to solve";
  }

  return record;
}

function canEditContribution(user, contribution) {
  if (!user || !contribution) {
    return false;
  }
  if (user.role === "ADMIN") {
    return true;
  }
  return (
    user.id === contribution.contributor_id &&
    (contribution.status === "PENDING" || contribution.status === "NEEDS_REVISION")
  );
}

function reviewStatus(action) {
  return REVIEW_ACTIONS[action] || "";
}

function knowledgeContent(contribution) {
  const lines = [
    contribution.question ? `Question / problem:\n${contribution.question}` : "",
    contribution.answer ? `Answer:\n${contribution.answer}` : "",
    contribution.system_prompt ? `System prompt:\n${contribution.system_prompt}` : "",
    contribution.feature ? `Feature: ${contribution.feature}` : "",
    contribution.module ? `Module: ${contribution.module}` : "",
    contribution.description ? `Description:\n${contribution.description}` : "",
    contribution.steps ? `Procedure:\n${contribution.steps}` : "",
    contribution.symptoms ? `Symptoms:\n${contribution.symptoms}` : "",
    contribution.cause ? `Possible cause:\n${contribution.cause}` : "",
    contribution.solution ? `Solution:\n${contribution.solution}` : "",
    contribution.escalate_when ? `Escalate when:\n${contribution.escalate_when}` : "",
    contribution.notes ? `Notes:\n${contribution.notes}` : "",
    contribution.encountered ? `What they encountered:\n${contribution.encountered}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

module.exports = {
  TYPES,
  STATUSES,
  validateRegistration,
  decideRole,
  validateContribution,
  canEditContribution,
  reviewStatus,
  knowledgeContent,
};
