class ErrorReply extends Error {
  constructor({code, message, requestInfo}) {
    super();

    Error.captureStackTrace(this, this.constructor);
    
    this.code = code;
    this.message = message;
    this.requestInfo = requestInfo;
  }
}
  
module.exports = ErrorReply;