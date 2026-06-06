import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3"
import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Readable } from "node:stream"

export interface StorageObject {
  key: string
  size: number
  lastModified: Date
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly endpoint: string

  constructor(private readonly config: ConfigService) {
    this.endpoint = config.getOrThrow<string>("S3_ENDPOINT")
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: config.get<string>("S3_REGION") ?? "us-east-1",
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY"),
      },
      forcePathStyle: true,
    })
  }

  async onModuleInit(): Promise<void> {
    const bucket = this.config.getOrThrow<string>("S3_BUCKET")
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }))
      this.logger.log(`Created bucket: ${bucket}`)
    }
  }

  async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    )
    return `${this.endpoint}/${bucket}/${key}`
  }

  async download(bucket: string, key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return result.Body as Readable
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }

  async list(bucket: string, prefix?: string): Promise<StorageObject[]> {
    const result = await this.client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
    )
    return (result.Contents ?? []).map((obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(0),
    }))
  }
}
