import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common"
import type { CreateCommentDto, UpdateCommentDto } from "./wiki.types"
import { WikiCommentsRepository } from "./wiki-comments.repository"
import { CurrentUser } from "../auth/current-user.decorator"
import type { AuthUser } from "../auth/auth.types"

@Controller("wiki/pages/:pageId/comments")
export class WikiCommentsController {
  constructor(private readonly repo: WikiCommentsRepository) {}

  @Get()
  listComments(@Param("pageId") pageId: string) {
    return this.repo.findByPage(pageId)
  }

  @Post()
  createComment(@Param("pageId") pageId: string, @Body() body: CreateCommentDto, @CurrentUser() user: AuthUser) {
    // Author is always the authenticated user — ignore any author field from client
    return this.repo.create(pageId, { ...body, author: user.username })
  }

  @Patch(":commentId")
  updateComment(@Param("commentId") commentId: string, @Body() body: UpdateCommentDto) {
    return this.repo.update(commentId, body)
  }

  @Delete(":commentId")
  async deleteComment(@Param("commentId") commentId: string) {
    await this.repo.delete(commentId)
    return { success: true }
  }
}
