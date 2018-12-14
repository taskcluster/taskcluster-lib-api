const ErrorReply = require('../error-reply')

/**
 * Create parameter validation middle-ware instance, given a mapping from
 * parameter to regular expression or function that returns a message as string
 * if the parameter is invalid.
 *
 * Parameters not listed in `req.params` will be ignored. But parameters
 * present must match the pattern given in `options` or the request will be
 * rejected with a 400 error message.
 */
const expressError = ({errorCodes, context}) => {
  return (err, req, res, next) => {
    if (err instanceof ErrorReply) {
      if (errorCodes[err.code]) {
        return res.status(errorCodes[err.code]).json(err)
      }
    }
    return res.reportInternalError(err);
  };
};

exports.expressError = expressError;
