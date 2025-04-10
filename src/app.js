const express = require('express');
require('dotenv').config();
const cors = require('cors');
const morgan = require('morgan');
const limiter = require('./middlewares/rate-limiter.middleware');

const app = express();

const Router = require('./routes/index.router');
const passport = require('passport');
const configureStrategies = require('./strategies/dynamicStrategy.strategy');

app.use(express.json());
app.use(express.urlencoded({ extended : true }));
app.use(express.static('/public'));
app.use(morgan('dev'));
app.use(limiter);

configureStrategies();
app.use(passport.initialize());

app.use(Router);

module.exports = app;