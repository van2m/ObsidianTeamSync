// API response types / API 响应类型

/** Standard API response wrapper / 标准 API 响应包装 */
export interface ApiResponse<T = unknown> {
  code: number;
  status: boolean;
  message: string;
  data: T;
}

/** Paginated response / 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** API error codes / API 错误码 */
export enum ApiErrorCode {
  Success = 0,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  Conflict = 409,
  InternalError = 500,
}
