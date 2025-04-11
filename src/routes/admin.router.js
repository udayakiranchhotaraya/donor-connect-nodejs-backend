const express = require("express");
const { listAllCenters } = require("../controllers/admin.controller");

const AdminRouter = express.Router();

AdminRouter.get("/centers", listAllCenters);

module.exports = AdminRouter;
