const env = require("../config/env");

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: env.cookieMaxAgeMs,
    path: "/",
  };
}

function setAdminCookie(res, token) {
  res.cookie(env.cookieName, token, getCookieOptions());
}

function clearAdminCookie(res) {
  res.clearCookie(env.cookieName, {
    ...getCookieOptions(),
    maxAge: undefined,
  });
}

module.exports = { getCookieOptions, setAdminCookie, clearAdminCookie };
