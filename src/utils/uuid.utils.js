const { v7: uuidv7 } = require('uuid');


module.exports = function generateUUID() {
    return uuidv7();
}