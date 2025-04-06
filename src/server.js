require('dotenv').config();
// const dbConnect = require('./db/db.config');

const app = require('./app');

const PORT = process.env.PORT || 4001;
const SERVER_URL = `http://localhost:${PORT}`;

(async function () {
    try {
        // await dbConnect();
        app.listen(PORT, () => console.log(`Server started at ${SERVER_URL}`));
    } catch (error) {
        console.error(`Connection error: ${error}`);
        process.exit(1);
    }
})();