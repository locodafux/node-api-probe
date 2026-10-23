export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
