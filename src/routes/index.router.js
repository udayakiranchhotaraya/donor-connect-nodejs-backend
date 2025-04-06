const express = require('express');

const Router = express.Router();

Router.get('/', (req, res) => {
    res.send("Welcome to donor connect api");
})

module.exports = Router;