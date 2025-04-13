const express = require('express');
const { onboardCenter, createNeed, centerAdminLogin } = require('../controllers/centers.controller');
const { verifyToken } = require('../middlewares/jwt.middleware');
const { checkBan } = require('../middlewares/center-ban-check.middleware');
const CenterRouter = express.Router();

CenterRouter.post('/login', centerAdminLogin);
CenterRouter.post('/onboard', verifyToken, onboardCenter);
CenterRouter.post('/create-need/:centerId', verifyToken, checkBan, createNeed);
module.exports = CenterRouter;