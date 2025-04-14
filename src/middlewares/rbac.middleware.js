function rbacMiddleware(requiredRole) {
    return (req, res, next) => {
        const user = req.user;

        if (!user || !Array.isArray(user.roles)) {
            return res.status(403).json({ message: "Access Denied: No roles found." });
        }

        if (!user.roles.includes(requiredRole)) {
            return res.status(403).json({ message: `Access Denied: Requires role ${requiredRole}.` });
        }

        next();
    };
}

module.exports = rbacMiddleware;
