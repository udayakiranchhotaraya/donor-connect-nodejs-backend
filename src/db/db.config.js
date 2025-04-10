const mongoose = require('mongoose');
const config = require('../config/config');

async function connectDB() {
    DB_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}`;
    DB_NAME = config.MONGO_DB_NAME;

    try {
        const connectionInstance = await mongoose.connect(`${DB_URI}/${DB_NAME}`);
        console.log(`Database \`${DB_NAME}\` connected.\nDB HOST: \`${connectionInstance.connection.host}\``);
    } catch (error) {
        console.error(`Connection error: ${error}`);
        process.exit(1);
    }
}

module.exports = connectDB;