const express = require('express');
const { onboardCenter } = require('../controllers/centers.controller');
const { verifyToken } = require('../middlewares/jwt.middleware');
const CenterRouter = express.Router();

CenterRouter.post('/onboard', verifyToken, onboardCenter);

module.exports = CenterRouter;