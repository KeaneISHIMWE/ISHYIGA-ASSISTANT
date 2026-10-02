const express = require("express");
const studio = require("../controllers/studioController");

const studioRouter = express.Router();

studioRouter.post("/auth/register", studio.register);
studioRouter.post("/auth/login", studio.login);
studioRouter.post("/auth/logout", studio.logout);
studioRouter.get("/auth/me", studio.me);
studioRouter.post("/auth/password", studio.changePassword);
studioRouter.post("/auth/email", studio.changeEmail);

studioRouter.get("/contributions", studio.myContributions);
studioRouter.post("/contributions", studio.createContribution);
studioRouter.get("/contributions/:id", studio.getContribution);
studioRouter.patch("/contributions/:id", studio.editContribution);

studioRouter.get("/knowledge", studio.guardKnowledge);
studioRouter.get("/admin/stats", studio.adminStats);
studioRouter.get("/admin/contributions", studio.adminList);
studioRouter.post("/admin/contributions/:id/review", studio.review);
studioRouter.post("/admin/contributions/:id/knowledge", studio.addToKnowledge);
studioRouter.delete("/admin/contributions/:id", studio.removeContribution);
studioRouter.get("/admin/prompts", studio.prompts);
studioRouter.get("/admin/users", studio.users);
studioRouter.patch("/admin/users/:id", studio.changeRole);
studioRouter.get("/admin/audit", studio.audit);

module.exports = { studioRouter };
