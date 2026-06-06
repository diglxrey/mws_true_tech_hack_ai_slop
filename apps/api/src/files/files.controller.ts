import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import * as multer from "multer"
import { FilesService } from "./files.service"

@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { storage: multer.memoryStorage() }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new NotFoundException("No file provided")
    return this.files.upload(file.originalname, file.buffer, file.mimetype, file.size)
  }

  @Get()
  list() {
    return this.files.list()
  }

  @Get("*key")
  async download(@Param("key") key: string, @Res() res: Response) {
    const stream = await this.files.download(key)
    stream.pipe(res)
  }

  @Delete("*key")
  async remove(@Param("key") key: string) {
    await this.files.delete(key)
    return { deleted: key }
  }
}
