/** One function per auth endpoint. Forms call these; they never build URLs themselves. */

import { api } from "@/lib/api";
import type { MessageResponse, RegisterResponse, UserResponse } from "@/types/api";

// Public auth endpoints: a 401 here is a real answer ("wrong password"), not an expired session.
const PUBLIC = { handleAuth: false } as const;

export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post<RegisterResponse>("/api/auth/register", { name, email, password }, PUBLIC),

  verifyEmail: (token: string) => api.post<UserResponse>("/api/auth/verify-email", { token }, PUBLIC),

  resendVerification: (email: string) =>
    api.post<MessageResponse>("/api/auth/resend-verification", { email }, PUBLIC),

  login: (email: string, password: string) =>
    api.post<UserResponse>("/api/auth/login", { email, password }, PUBLIC),

  logout: () => api.post<MessageResponse>("/api/auth/logout", undefined, PUBLIC),

  me: () => api.get<UserResponse>("/api/auth/me"),

  forgotPassword: (email: string) =>
    api.post<MessageResponse>("/api/auth/forgot-password", { email }, PUBLIC),

  resetPassword: (token: string, newPassword: string) =>
    api.post<MessageResponse>(
      "/api/auth/reset-password",
      { token, new_password: newPassword },
      PUBLIC,
    ),
};
