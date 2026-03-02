import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      // add other user properties if needed
    };
    accessToken?: string;
  }
}
