const { Center, User } = require("../models");

class BanCheckMiddleware {
  constructor(donorCenterService) {
    this.donorCenterService = donorCenterService;
  }

  async checkBan(req, res, next) {
    try {
      const { centerId } = req.params;
      const center = await Center.findOne({ center_id: centerId });
      if (center && center.isBanned && center.verification.status === 'verified' ) {
        return res.status(403).json({ message: 'This donor center is banned.' });
      }
      else if(center && (center.verification.status === 'pending' || center.verification.status === 'rejected'))
        return res.status(403).json({ message: 'This donor center is not verified.' });
      req.center_details = center;
      next();
    } catch (error) {
      next(error);
    }
  }
}

const banCheckMiddleware = new BanCheckMiddleware();
module.exports = banCheckMiddleware;