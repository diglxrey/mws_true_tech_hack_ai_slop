import { HttpException, HttpStatus } from "@nestjs/common"

export type InternalToolErrorCode =
  | "SNIPPET_NOT_FOUND"
  | "SLUG_ALREADY_EXISTS"
  | "VARIABLE_NOT_FOUND"
  | "TABLE_NOT_FOUND"
  | "COLUMN_NOT_FOUND"
  | "INVALID_PARAMS"
  | "DB_ERROR"

export interface InternalToolErrorBody {
  error: true
  code: InternalToolErrorCode
  message: string
}

export class InternalToolHttpException extends HttpException {
  constructor(
    public readonly toolCode: InternalToolErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ error: true, code: toolCode, message } satisfies InternalToolErrorBody, status)
  }
}
