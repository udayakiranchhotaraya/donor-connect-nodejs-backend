const express = require('express');
const UserRouter = require('./user.router');
const AuthenticationRouter = require('./auth.router');
const CenterRouter = require('./centers.router');

const Router = express.Router();

Router.get('/', (req, res) => {
    res.send("Welcome to donor connect api");
})

Router.use('/users', UserRouter)
Router.use('/users/authentication', AuthenticationRouter);
Router.use('/centers', CenterRouter);

module.exports = Router;