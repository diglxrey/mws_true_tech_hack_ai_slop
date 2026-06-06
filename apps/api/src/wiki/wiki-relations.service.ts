import { Injectable } from "@nestjs/common"
import * as Y from "yjs"
import { WikiPagesRepository } from "./wiki-pages.repository"

const WIKI_LINK_RE = /\[\[([^[\]]+)\]\]/g
const TAG_RE = /(^|[^a-zA-Z0-9_])#([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})/g
const WIKI_HREF_ID_RE = /href="\/wiki\/([0-9a-f-]{36})"/gi

@Injectable()
export class WikiRelationsService {
  constructor(private readonly pagesRepo: WikiPagesRepository) {}

  async reindexPageFromSnapshot(pageId: string, snapshot: Buffer): Promise<void> {
    const { targetIds, tagNames } = await this.extractTargetsAndTags(pageId, snapshot)
    await this.pagesRepo.replaceLinks(pageId, [...targetIds])

    const tags = await this.pagesRepo.upsertTags(tagNames)
    await this.pagesRepo.replacePageTags(
      pageId,
      tags.map((tag) => tag.id),
    )
  }

  async reindexAllPagesForRename(renamedPageId: string, previousTitle: string): Promise<void> {
    const previousTitleNormalized = previousTitle.trim().toLowerCase()
    if (!previousTitleNormalized) return

    const allPages = await this.pagesRepo.findAll()
    for (const sourcePage of allPages) {
      const snapshot = await this.pagesRepo.loadSnapshot(sourcePage.id)
      if (!snapshot) continue

      const { targetIds, tagNames } = await this.extractTargetsAndTags(sourcePage.id, snapshot)
      const xmlContent = this.extractXmlContent(snapshot)
      const plainText = this.extractPlainText(xmlContent)
      const wikiLinkTerms = this.extractWikiLinks(plainText)
      if (wikiLinkTerms.some((term) => term.toLowerCase() === previousTitleNormalized)) {
        targetIds.add(renamedPageId)
      }

      await this.pagesRepo.replaceLinks(sourcePage.id, [...targetIds])

      const tags = await this.pagesRepo.upsertTags(tagNames)
      await this.pagesRepo.replacePageTags(
        sourcePage.id,
        tags.map((tag) => tag.id),
      )
    }
  }

  private async extractTargetsAndTags(pageId: string, snapshot: Buffer): Promise<{ targetIds: Set<string>; tagNames: string[] }> {
    const xmlContent = this.extractXmlContent(snapshot)
    const plainText = this.extractPlainText(xmlContent)
    const wikiLinkTerms = this.extractWikiLinks(plainText)
    const directWikiLinkIds = this.extractWikiLinkIds(xmlContent)
    const tagNames = this.extractTags(plainText)

    const pages = await this.pagesRepo.findByTitlesOrSlugs(wikiLinkTerms)
    const targetIds = new Set<string>()
    const byTerm = new Map<string, string>()
    for (const page of pages) {
      byTerm.set(page.title.toLowerCase(), page.id)
      byTerm.set(page.slug.toLowerCase(), page.id)
    }
    for (const term of wikiLinkTerms) {
      const pageIdForTerm = byTerm.get(term.toLowerCase())
      if (pageIdForTerm && pageIdForTerm !== pageId) {
        targetIds.add(pageIdForTerm)
      }
    }
    for (const linkedId of directWikiLinkIds) {
      if (linkedId !== pageId) {
        targetIds.add(linkedId)
      }
    }

    return { targetIds, tagNames }
  }

  private extractXmlContent(snapshot: Buffer): string {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, new Uint8Array(snapshot))
    return doc.getXmlFragment("content").toString()
  }

  private extractPlainText(xmlContent: string): string {
    return xmlContent
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  private extractWikiLinks(content: string): string[] {
    const links = new Set<string>()
    for (const match of content.matchAll(WIKI_LINK_RE)) {
      const term = (match[1] ?? "").trim()
      if (term) {
        links.add(term)
      }
    }
    return [...links]
  }

  private extractWikiLinkIds(xmlContent: string): string[] {
    const ids = new Set<string>()
    for (const match of xmlContent.matchAll(WIKI_HREF_ID_RE)) {
      const id = (match[1] ?? "").trim()
      if (id) {
        ids.add(id)
      }
    }
    return [...ids]
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>()
    for (const match of content.matchAll(TAG_RE)) {
      const tag = (match[2] ?? "").trim().toLowerCase()
      if (tag) {
        tags.add(tag)
      }
    }
    return [...tags]
  }
}
