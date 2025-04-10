const passport = require("passport");
const { OAUTH_PROVIDERS } = require("../config/config");

function configureStrategies() {
    Object.entries(OAUTH_PROVIDERS).forEach(([providerName, config]) => {
        const Strategy = config.STRATEGY;

        passport.use(
            new Strategy(
                {
                    clientID: config.CLIENT_ID,
                    clientSecret: config.CLIENT_SECRET,
                    callbackURL: config.CALLBACK_URL.replace(
                        ":provider",
                        providerName.toLowerCase()
                    ),
                    scope: config.scope || ["email"],
                    profileFields: config.profileFields || null,
                    passReqToCallback: true,
                },
                (req, accessToken, refreshToken, profile, done) => {
                    const email = profile.emails?.[0]?.value;
                    const name =
                        profile.displayName ||
                        `${profile.name?.givenName} ${profile.name?.familyName}`;

                    if (!email)
                        return done(new Error("No email found in profile"));

                    return done(null, {
                        provider: providerName,
                        email,
                        name,
                    });
                }
            )
        );
    });
}

module.exports = configureStrategies;
