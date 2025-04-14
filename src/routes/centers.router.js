const express = require('express');
const { onboardCenter, createNeed, centerAdminLogin, upload, getMyCreatedNeeds, getContributionsList, handleCenterAdminContributionDecision } = require('../controllers/centers.controller');
const { verifyToken } = require('../middlewares/jwt.middleware');
const centerCheckMiddleware = require('../middlewares/center-check.middleware');
const { generateCenterId } = require('../utils/uuid.utils');
const rbacMiddleware = require('../middlewares/rbac.middleware');
const CenterRouter = express.Router();

CenterRouter.post('/login', centerAdminLogin);
CenterRouter.post('/register', verifyToken, generateCenterId, upload.array('documents'), onboardCenter);
CenterRouter.post('/:centerId/create-need', verifyToken, rbacMiddleware('center-admin'), centerCheckMiddleware, createNeed);
CenterRouter.get('/:centerId/get-all-needs', verifyToken, rbacMiddleware('center-admin'), centerCheckMiddleware, getMyCreatedNeeds);
CenterRouter.get('/:centerId/contributions/', verifyToken, rbacMiddleware('center-admin'), centerCheckMiddleware, getContributionsList);
CenterRouter.patch('/:centerId/contributions/:contributionId', verifyToken, rbacMiddleware('center-admin'), centerCheckMiddleware, handleCenterAdminContributionDecision);

module.exports = CenterRouter;