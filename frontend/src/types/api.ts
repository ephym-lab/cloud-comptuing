/** Shapes returned by the Flask API. Keep in sync with backend/app/schemas. */

export interface User {
  id: string;
  name: string;
  email: string;
  is_verified: boolean;
  created_at: string;
}

export interface UserResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

export interface RegisterResponse extends MessageResponse {
  user: User;
}

/** Every API error has this shape: {"error": {"code", "message", "details"}} */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: {
      /** Field-level validation errors, e.g. {"password": ["Must be at least 8 characters."]} */
      fields?: Record<string, string[] | Record<string, string[]>>;
      [key: string]: unknown;
    };
  };
}
