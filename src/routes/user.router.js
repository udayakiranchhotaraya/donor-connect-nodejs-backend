const express = require("express");

const {
    initiateRegistration,
    completeRegistration,
} = require("../controllers/user.controller");

const UserRouter = express.Router();

UserRouter.post("/register", initiateRegistration);
UserRouter.put("/verify", completeRegistration);

module.exports = UserRouter;
