const express = require("express");
const {
    listAllCenters,
    viewCenterDetails,
    verifyDocuments,
    updateCenterVerificationStatus,
    banCenter,
    unbanCenter,
} = require("../controllers/admin.controller");

const AdminRouter = express.Router();

AdminRouter.get("/centers", listAllCenters);
AdminRouter.get("/centers/:centerID", viewCenterDetails);
AdminRouter.patch("/centers/:centerID/verification/documents/:documentRefID", verifyDocuments);
AdminRouter.patch("/centers/:centerID/verification/:status", updateCenterVerificationStatus);
AdminRouter.patch("/centers/:centerID/ban", banCenter);
AdminRouter.patch("/centers/:centerID/unban", unbanCenter);

module.exports = AdminRouter;
