const express = require("express");

const {
    initiateRegistration,
    completeRegistration,
    getNeeds,
    createContribution,
    getMyContributions,
    cancelContribution
} = require("../controllers/user.controller");
const { verifyToken } = require('../middlewares/jwt.middleware');

const UserRouter = express.Router();

UserRouter.post("/register", initiateRegistration);
UserRouter.put("/verify", completeRegistration);
UserRouter.get("/needs", getNeeds);
UserRouter.post("/contribute", verifyToken, createContribution);
UserRouter.get("/contributions", verifyToken, getMyContributions);
UserRouter.patch("/contributions/:contributionId/cancel", verifyToken, cancelContribution);

module.exports = UserRouter;
