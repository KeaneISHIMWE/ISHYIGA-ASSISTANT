const { toCanonicalWhatsappDigits } = require("../services/contactRules");
const { fetchClientProfile } = require("../services/clientProfileService");

function publicAccount(profile) {
  return {
    name: profile.name || "",
    company: profile.company || "",
    phoneNumber: profile.phoneNumber || "",
    fields: Array.isArray(profile.fields) ? profile.fields : [],
  };
}

async function getAccount(req, res) {
  const phone = toCanonicalWhatsappDigits(req.query.phone || "");
  if (!phone) {
    return res.status(400).json({ error: "phone is required" });
  }

  const result = await fetchClientProfile({ phoneNumber: phone });
  if (result.error === "not_configured") {
    return res.status(503).json({ error: "Account database is not configured" });
  }
  if (result.error === "not_found" || result.error === "empty") {
    return res.status(404).json({
      error: "I couldn't verify an account associated with this number.",
    });
  }
  if (result.error === "ambiguous") {
    return res.status(409).json({
      error: "This phone number is registered on more than one account, so I can't tell which account is yours.",
    });
  }
  if (result.error === "timeout" || result.error === "api_error" || result.error === "unhandled") {
    return res.status(503).json({
      error: "A technical issue is temporarily preventing account retrieval.",
    });
  }
  if (!result.profile) {
    return res.status(404).json({
      error: "I couldn't find that information in the available account records.",
    });
  }

  return res.status(200).json({
    ok: true,
    account: publicAccount(result.profile),
  });
}

module.exports = { getAccount, publicAccount };
