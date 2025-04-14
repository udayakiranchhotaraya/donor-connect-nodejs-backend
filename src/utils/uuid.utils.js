const { v7: uuidv7 } = require('uuid');

function generateUUID() {
    return uuidv7();
}

function generateCenterId(req, res, next) {
    req.centerId = generateUUID();
    next();
}

module.exports = {
    generateUUID,
    generateCenterId
};
