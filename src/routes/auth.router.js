const express = require("express");
const {
    legacyLogin,
    socialLoginInitiate,
    socialLoginCallback,
} = require("../controllers/authentication.controller");

const AuthenticationRouter = express.Router();

AuthenticationRouter.post("/login", legacyLogin);
AuthenticationRouter.get("/:provider", socialLoginInitiate);
AuthenticationRouter.get("/:provider/callback", socialLoginCallback);

module.exports = AuthenticationRouter;