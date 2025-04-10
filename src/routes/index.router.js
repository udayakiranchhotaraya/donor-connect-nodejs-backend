const express = require('express');
const UserRouter = require('./user.router');

const Router = express.Router();

Router.get('/', (req, res) => {
    res.send("Welcome to donor connect api");
})

Router.use('/users', UserRouter)

module.exports = Router;