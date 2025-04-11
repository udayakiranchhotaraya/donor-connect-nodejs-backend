const SuperAdminCheck = (req, res, next) => {

    const isSuperAdmin = req.user?.isSuperAdmin === true;

    if ( !isSuperAdmin ) {
        return res.status(403).json({ 'message': "Access denied." });
    }

    next();
}

module.exports = SuperAdminCheck;