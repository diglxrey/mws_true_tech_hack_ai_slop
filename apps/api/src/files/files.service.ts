import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { StorageObject, StorageService } from "../storage/storage.service"

export interface UploadedFile {
  key: string
  url: string
  size: number
  mimetype: string
}

@Injectable()
export class FilesService {
  private readonly bucket: string

  constructor(
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>("S3_BUCKET") ?? "snippeter-files"
  }

  async upload(
    originalname: string,
    buffer: Buffer,
    mimetype: string,
    size: number,
  ): Promise<UploadedFile> {
    const key = `${randomUUID()}/${originalname}`
    const url = await this.storage.upload(this.bucket, key, buffer, mimetype)
    return { key, url, size, mimetype }
  }

  list(prefix?: string): Promise<StorageObject[]> {
    return this.storage.list(this.bucket, prefix)
  }

  download(key: string): Promise<Readable> {
    return this.storage.download(this.bucket, key)
  }

  delete(key: string): Promise<void> {
    return this.storage.delete(this.bucket, key)
  }
}
