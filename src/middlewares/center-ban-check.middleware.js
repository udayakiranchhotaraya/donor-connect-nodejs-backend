const { Center, User } = require("../models");

class BanCheckMiddleware {
  constructor(donorCenterService) {
    this.donorCenterService = donorCenterService;
  }

  async checkBan(req, res, next) {
    try {
      const { id } = req.params;
      const center = await Center.findOne({ center_id: id });
      if (center && center.isBanned && center.verification.status === 'verified' ) {
        return res.status(403).json({ message: 'This donor center is banned.' });
      }
      next();
    } catch (error) {
      next(error);
    }
  }
}

const banCheckMiddleware = new BanCheckMiddleware();
module.exports = banCheckMiddleware;