const { Center } = require("../models");

const centerCheckMiddleware = async (req, res, next) => {
    try {
        const user = req.user;
        const { centerId } = req.params;

        const center = await Center.findOne({ center_id: centerId });
        if (center && center.admin_id === user.sub) {
            return res.status(401).json({ message: "You are not allowed to perform operations on behalf of this center." });
        }
        if (center && center.isBanned) {
            return res.status(403).json({ message: "This center is currently banned." });
        }
        if (center && ( center.verification.status === 'pending' || center.verification.status === 'rejected' )) {
            return res.status(403).json({ message: "This center is not verified" });
        }
        // req.centerID = center.center_id;
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = centerCheckMiddleware;