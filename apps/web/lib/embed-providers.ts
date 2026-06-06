export type EmbedProviderKind =
  | "youtube"
  | "figma"
  | "googleMaps"
  | "vkVideo"
  | "rutube"
  | "image"
  | "link"
  | "invalid"

type ProviderMatcher = {
  kind: Exclude<EmbedProviderKind, "link" | "invalid" | "image">
  match: (url: URL) => boolean
  toEmbedSrc: (url: URL) => string | null
}

export type EmbedViewModel = {
  kind: EmbedProviderKind
  inputUrl: string
  resolvedUrl: string | null
  domain: string | null
  embedSrc: string | null
  imageSrc: string | null
  faviconSrc: string | null
  label: string
}

const providerMatchers: ProviderMatcher[] = [
  {
    kind: "youtube",
    match: (url) => {
      const host = normalizeHost(url.hostname)
      return host === "youtube.com" || host === "youtu.be"
    },
    toEmbedSrc: (url) => {
      const videoId = getYouTubeVideoId(url)
      if (!videoId) return null
      return `https://www.youtube.com/embed/${videoId}`
    },
  },
  {
    kind: "figma",
    match: (url) => normalizeHost(url.hostname).endsWith("figma.com"),
    toEmbedSrc: (url) => `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.toString())}`,
  },
  {
    kind: "googleMaps",
    match: (url) => {
      const host = normalizeHost(url.hostname)
      return host.includes("google.") && url.pathname.includes("/maps")
    },
    toEmbedSrc: (url) => getGoogleMapsEmbedSrc(url),
  },
  {
    kind: "vkVideo",
    match: (url) => {
      const host = normalizeHost(url.hostname)
      return host === "vkvideo.ru" || host === "vk.com"
    },
    toEmbedSrc: (url) => getVkVideoEmbedSrc(url),
  },
  {
    kind: "rutube",
    match: (url) => normalizeHost(url.hostname).endsWith("rutube.ru"),
    toEmbedSrc: (url) => getRutubeEmbedSrc(url),
  },
]

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "")
}

function parseHttpUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    return url
  } catch {
    return null
  }
}

function getYouTubeVideoId(url: URL): string | null {
  const host = normalizeHost(url.hostname)
  const pathParts = url.pathname.split("/").filter(Boolean)

  if (host === "youtu.be") {
    return pathParts[0] || null
  }

  if (host !== "youtube.com") {
    return null
  }

  if (url.pathname === "/watch") {
    return url.searchParams.get("v")
  }

  if (pathParts[0] === "shorts") {
    return pathParts[1] || null
  }

  if (pathParts[0] === "embed") {
    return pathParts[1] || null
  }

  return null
}

function isImageUrl(url: URL): boolean {
  return /\.(gif|png|jpe?g|webp|bmp|svg|avif)$/i.test(url.pathname)
}

function getGoogleMapsEmbedSrc(url: URL): string | null {
  if (url.pathname.includes("/maps/embed")) {
    return url.toString()
  }

  const query = url.searchParams.get("q") ?? url.searchParams.get("query")
  if (query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(url.toString())}&output=embed`
}

function getVkVideoEmbedSrc(url: URL): string | null {
  const host = normalizeHost(url.hostname)

  if (host === "vkvideo.ru") {
    const path = url.pathname.replace(/\/+$/, "")
    if (!path || path === "/") return null
    if (path.startsWith("/video")) {
      const match = path.match(/video(-?\d+_\d+)/)
      const capture = match?.[1]
      if (!capture) return null
      const [oid, id] = capture.split("_")
      if (oid == null || id == null) return null
      return `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2`
    }
    return null
  }

  if (host === "vk.com") {
    const byPath = url.pathname.match(/video(-?\d+_\d+)/)
    const byPathCapture = byPath?.[1]
    if (byPathCapture) {
      const [oid, id] = byPathCapture.split("_")
      if (oid == null || id == null) return null
      return `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2`
    }

    const video = url.searchParams.get("z")
    if (!video) return null
    const match = video.match(/video-?\d+_\d+/)
    if (!match) return null

    const normalized = match[0].replace("video", "")
    const [oid, id] = normalized.split("_")
    if (!oid || !id) return null
    return `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2`
  }

  return null
}

function getRutubeEmbedSrc(url: URL): string | null {
  const pathParts = url.pathname.split("/").filter(Boolean)
  if (pathParts[0] === "video" && pathParts[1]) {
    return `https://rutube.ru/play/embed/${pathParts[1]}`
  }

  if (pathParts[0] === "play" && pathParts[1] === "embed" && pathParts[2]) {
    return `https://rutube.ru/play/embed/${pathParts[2]}`
  }

  return null
}

export function detectEmbedProvider(url: URL): EmbedProviderKind {
  if (isImageUrl(url)) {
    return "image"
  }

  for (const provider of providerMatchers) {
    if (provider.match(url) && provider.toEmbedSrc(url)) {
      return provider.kind
    }
  }

  return "link"
}

export function toEmbedViewModel(rawUrl: string): EmbedViewModel {
  const parsedUrl = parseHttpUrl(rawUrl)
  if (!parsedUrl) {
    return {
      kind: "invalid",
      inputUrl: rawUrl,
      resolvedUrl: null,
      domain: null,
      embedSrc: null,
      imageSrc: null,
      faviconSrc: null,
      label: "Invalid URL",
    }
  }

  const domain = normalizeHost(parsedUrl.hostname)
  const resolvedUrl = parsedUrl.toString()
  const faviconSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`

  if (isImageUrl(parsedUrl)) {
    return {
      kind: "image",
      inputUrl: rawUrl,
      resolvedUrl,
      domain,
      embedSrc: null,
      imageSrc: resolvedUrl,
      faviconSrc,
      label: "Image preview",
    }
  }

  for (const provider of providerMatchers) {
    if (!provider.match(parsedUrl)) continue
    const embedSrc = provider.toEmbedSrc(parsedUrl)
    if (!embedSrc) continue

    return {
      kind: provider.kind,
      inputUrl: rawUrl,
      resolvedUrl,
      domain,
      embedSrc,
      imageSrc: null,
      faviconSrc,
      label: getLabelForProvider(provider.kind),
    }
  }

  return {
    kind: "link",
    inputUrl: rawUrl,
    resolvedUrl,
    domain,
    embedSrc: null,
    imageSrc: null,
    faviconSrc,
    label: "Link preview",
  }
}

function getLabelForProvider(kind: Exclude<EmbedProviderKind, "link" | "invalid" | "image">): string {
  switch (kind) {
    case "youtube":
      return "YouTube"
    case "figma":
      return "Figma"
    case "googleMaps":
      return "Google Maps"
    case "vkVideo":
      return "VK Video"
    case "rutube":
      return "Rutube"
    default:
      return "Embed"
  }
}
