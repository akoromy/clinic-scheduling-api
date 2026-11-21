// one error class so that we can use it for all errors consistently

class ApiError extends Error {
    constructor(status, code, message){
        super(message);
        this.status = status;
        this.code = code;
    }
}

  const badRequest = (msg) => new ApiError(400, 'INVALID_INPUT', msg);
  const unauthenticated = (msg) => new ApiError(401, 'UNAUTHENTICATED', msg);
  const forbidden = (msg) => new ApiError(403, 'FORBIDDEN', msg);
  const notFound = (msg) => new ApiError(404, 'NOT_FOUND', msg);
  const conflict = (msg) => new ApiError(409, 'BOOKING_CONFLICT', msg);

  module.exports = { ApiError, badRequest, unauthenticated, forbidden, notFound, conflict };
