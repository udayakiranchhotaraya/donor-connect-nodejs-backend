const express = require("express");
const {
    listAllCenters,
    viewCenterDetails,
} = require("../controllers/admin.controller");

const AdminRouter = express.Router();

AdminRouter.get("/centers", listAllCenters);
AdminRouter.get("/centers/:centerID", viewCenterDetails);

module.exports = AdminRouter;
