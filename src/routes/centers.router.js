const express = require('express');
const { onboardCenter, createNeed } = require('../controllers/centers.controller');
const { verifyToken } = require('../middlewares/jwt.middleware');
const { checkBan } = require('../middlewares/center-ban-check.middleware');
const CenterRouter = express.Router();

CenterRouter.post('/onboard', verifyToken, onboardCenter);
CenterRouter.post('/create-need', verifyToken, checkBan, createNeed);
module.exports = CenterRouter;