import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"
import type { Response } from "express"
import {
  type InternalToolErrorBody,
  type InternalToolErrorCode,
  InternalToolHttpException,
} from "./internal-tool-error"

function isInternalToolErrorBody(x: unknown): x is InternalToolErrorBody {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as InternalToolErrorBody).error === true &&
    typeof (x as InternalToolErrorBody).code === "string"
  )
}

function messageFromExceptionResponse(exResponse: string | object): string {
  if (typeof exResponse === "string") return exResponse
  if (typeof exResponse === "object" && exResponse !== null && "message" in exResponse) {
    const m = (exResponse as { message: unknown }).message
    if (Array.isArray(m)) return m.join(", ")
    if (typeof m === "string") return m
  }
  return "Request failed"
}

@Catch()
export class InternalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (exception instanceof UnauthorizedException) {
      const msg = messageFromExceptionResponse(exception.getResponse())
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: true,
        code: "INVALID_PARAMS" as InternalToolErrorCode,
        message: msg || "Unauthorized",
      } satisfies InternalToolErrorBody)
      return
    }

    if (exception instanceof InternalToolHttpException) {
      const body = exception.getResponse() as InternalToolErrorBody
      res.status(exception.getStatus()).json(body)
      return
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exResponse = exception.getResponse()
      if (isInternalToolErrorBody(exResponse)) {
        res.status(status).json(exResponse)
        return
      }
      const msg = messageFromExceptionResponse(exResponse)

      if (exception instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          error: true,
          code: "SNIPPET_NOT_FOUND" satisfies InternalToolErrorCode,
          message: msg || "Not found",
        } satisfies InternalToolErrorBody)
        return
      }

      if (exception instanceof ConflictException) {
        const code: InternalToolErrorCode = msg.includes("slug")
          ? "SLUG_ALREADY_EXISTS"
          : "INVALID_PARAMS"
        res.status(HttpStatus.CONFLICT).json({
          error: true,
          code,
          message: msg,
        } satisfies InternalToolErrorBody)
        return
      }

      if (exception instanceof BadRequestException) {
        const code = mapBadRequestToCode(msg, exResponse)
        res.status(HttpStatus.BAD_REQUEST).json({
          error: true,
          code,
          message: msg,
        } satisfies InternalToolErrorBody)
        return
      }

      if (status >= 500) {
        res.status(status).json({
          error: true,
          code: "DB_ERROR" satisfies InternalToolErrorCode,
          message: "Database or server error",
        } satisfies InternalToolErrorBody)
        return
      }

      res.status(status).json({
        error: true,
        code: "INVALID_PARAMS" satisfies InternalToolErrorCode,
        message: msg,
      } satisfies InternalToolErrorBody)
      return
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: true,
      code: "DB_ERROR" satisfies InternalToolErrorCode,
      message: "Unexpected error",
    } satisfies InternalToolErrorBody)
  }
}

function mapBadRequestToCode(msg: string, exResponse: string | object): InternalToolErrorCode {
  const lower = msg.toLowerCase()
  if (lower.includes("source_table") && lower.includes("not allowed")) return "TABLE_NOT_FOUND"
  if (lower.includes("source_column not found")) return "COLUMN_NOT_FOUND"
  if (lower.includes("filter column not found")) return "COLUMN_NOT_FOUND"
  if (lower.includes("concat_order_column not found")) return "COLUMN_NOT_FOUND"
  if (lower.includes("unknown source_table")) return "TABLE_NOT_FOUND"
  if (lower.includes("missing context")) return "INVALID_PARAMS"
  if (lower.includes("context.")) return "INVALID_PARAMS"
  if (lower.includes("context must be an object")) return "INVALID_PARAMS"
  if (typeof exResponse === "object" && exResponse !== null && "missingContextKey" in exResponse) {
    return "INVALID_PARAMS"
  }
  return "INVALID_PARAMS"
}
