const express = require("express");
const aiStudio = require("../controllers/aiStudioController");

const aiStudioRouter = express.Router();

aiStudioRouter.post("/auth/request-otp", aiStudio.requestOtp);
aiStudioRouter.post("/auth/verify-otp", aiStudio.verifyOtp);
aiStudioRouter.post("/auth/logout", aiStudio.logout);
aiStudioRouter.get("/auth/me", aiStudio.me);
aiStudioRouter.get("/overview", aiStudio.overview);
aiStudioRouter.get("/conversations", aiStudio.conversations);
aiStudioRouter.get("/conversations/:id/messages", aiStudio.messages);
aiStudioRouter.post("/corrections", aiStudio.createCorrection);
aiStudioRouter.get("/corrections", aiStudio.corrections);
aiStudioRouter.get("/memories", aiStudio.memories);
aiStudioRouter.delete("/memories/:id", aiStudio.removeMemory);
aiStudioRouter.get("/admin/reviews", aiStudio.pendingReviews);
aiStudioRouter.post("/admin/reviews/:id", aiStudio.decideReview);

module.exports = { aiStudioRouter };
