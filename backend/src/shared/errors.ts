export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(400, message); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, message); }
}
export class UnprocessableError extends AppError {
  constructor(message: string) { super(422, message); }
}
