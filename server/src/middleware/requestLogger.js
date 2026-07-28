const { REQUEST_ID_HEADER, createRequestLogger } = require('../logger');

/**
 * Attaches a request-scoped `req.log` (see ../logger.js) and echoes the
 * request id back as a response header so a client can report it back when
 * debugging a specific failed request.
 */
function requestLogger(req, res, next) {
  req.log = createRequestLogger(req);
  res.setHeader(REQUEST_ID_HEADER, req.log.requestId);
  next();
}

module.exports = requestLogger;
