const express = require("express");
const { listAllCenters } = require("../controllers/admin.controller");

const AdminRouter = express.Router();

AdminRouter.get("/list-all-centers", listAllCenters);

module.exports = AdminRouter;
