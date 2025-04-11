const express = require('express');
const UserRouter = require('./user.router');
const AuthenticationRouter = require('./auth.router');
const CenterRouter = require('./centers.router');
const AdminRouter = require('./admin.router');
const SuperAdminCheck = require('../middlewares/super-admin-check.middleware');
const { verifyToken } = require('../middlewares/jwt.middleware');
const { login } = require('../controllers/admin.controller');

const Router = express.Router();

Router.get('/', (req, res) => {
    res.send("Welcome to donor connect api");
})

Router.use('/users', UserRouter)
Router.use('/users/authentication', AuthenticationRouter);
Router.use('/centers', CenterRouter);
Router.use('/admin/login', login);
Router.use('/admin', verifyToken , SuperAdminCheck, AdminRouter);

module.exports = Router;