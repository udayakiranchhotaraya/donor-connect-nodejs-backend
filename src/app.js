const express = require('express');
require('dotenv').config();
const cors = require('cors');
const morgan = require('morgan');
const limiter = require('./middlewares/rate-limiter.middleware');

const app = express();

const Router = require('./routes/index.router');

app.use(express.json());
app.use(express.urlencoded({ extended : true }));
app.use(express.static('/public'));
app.use(morgan('dev'));
app.use(limiter);

app.use('/api', Router);

module.exports = app;