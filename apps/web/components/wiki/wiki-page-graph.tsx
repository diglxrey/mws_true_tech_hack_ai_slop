"use client"

import { useEffect, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import type { WikiGraphData, WikiGraphNode } from "@/lib/wiki-types"

/* eslint-disable @typescript-eslint/no-explicit-any */

interface WikiPageGraphProps {
  data: WikiGraphData
  selectedNodeId?: string | null
  onNodeClick?: (node: WikiGraphNode) => void
  className?: string
}

export function WikiPageGraph({ data, selectedNodeId, onNodeClick, className }: WikiPageGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const destroyRef = useRef(false)
  const { resolvedTheme } = useTheme()

  const colorForNode = useCallback((_node: WikiGraphNode) => {
    const isDark = resolvedTheme === "dark"
    if (_node.kind === "tag") {
      return "oklch(0.72 0.16 85)"
    }
    return isDark ? "oklch(0.72 0.22 284)" : "oklch(0.588 0.22 284)"
  }, [resolvedTheme])

  const sizeScale = useCallback((size: number) => {
    return Math.sqrt(Math.max(1, size)) * 5 + 6
  }, [])

  useEffect(() => {
    destroyRef.current = false
    const svg = svgRef.current
    if (!svg) return

    let d3: typeof import("d3") | null = null

    void import("d3").then((mod) => {
      if (destroyRef.current) return
      d3 = mod

      const width = svg.clientWidth || 900
      const height = svg.clientHeight || 600

      d3.select(svg).selectAll("*").remove()

      const rootG = d3.select(svg).append("g")

      const zoom = (d3.zoom() as any)
        .scaleExtent([0.1, 8])
        .on("zoom", (event: any) => {
          rootG.attr("transform", event.transform)
        })
      ;(d3.select(svg) as any).call(zoom)

      // Build node and link data
      const nodeMap = new Map(data.nodes.map((n) => [n.id, { ...n }]))
      const simNodes = data.nodes.map((n) => ({ ...n })) as any[]
      const simLinks = data.links
        .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
        .map((l) => ({ source: l.source, target: l.target, kind: l.kind })) as any[]

      const simulation = (d3.forceSimulation(simNodes) as any)
        .force("link", (d3.forceLink(simLinks) as any).id((d: any) => d.id).distance(80).strength(0.5))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius((d: any) => sizeScale(d.size) + 4))

      // Links
      const link = rootG
        .append("g")
        .selectAll("line")
        .data(simLinks)
        .enter()
        .append("line")
        .attr("stroke", (d: any) => {
          const isDark = resolvedTheme === "dark"
          return d.kind === "tag-link"
            ? "oklch(0.72 0.1 85 / 0.35)"
            : isDark ? "oklch(1 0 0 / 0.2)" : "oklch(0.6 0 0 / 0.3)"
        })
        .attr("stroke-width", (d: any) => (d.kind === "tag-link" ? 1.2 : 1))

      // Nodes
      const node = rootG
        .append("g")
        .selectAll("circle")
        .data(simNodes)
        .enter()
        .append("circle")
        .attr("r", (d: any) => sizeScale(d.size))
        .attr("fill", (d: any) => colorForNode(d))
        .attr("stroke", (d: any) => (d.id === selectedNodeId ? "#fff" : "transparent"))
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("click", (_event: any, d: any) => {
          onNodeClick?.(d as WikiGraphNode)
        })
        .call(
          (d3.drag() as any)
            .on("start", (event: any, d: any) => {
              if (!event.active) simulation.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on("drag", (event: any, d: any) => { d.fx = event.x; d.fy = event.y })
            .on("end", (event: any, d: any) => {
              if (!event.active) simulation.alphaTarget(0)
              d.fx = null; d.fy = null
            }),
        )

      // Labels
      const label = rootG
        .append("g")
        .selectAll("text")
        .data(simNodes)
        .enter()
        .append("text")
        .text((d: any) => d.title ?? d.id)
        .attr("font-size", "10px")
        .attr("dy", (d: any) => sizeScale(d.size) + 12)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("pointer-events", "none")
        .style("opacity", 0.7)

      simulation.on("tick", () => {
        link
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y)
        node
          .attr("cx", (d: any) => d.x)
          .attr("cy", (d: any) => d.y)
        label
          .attr("x", (d: any) => d.x)
          .attr("y", (d: any) => d.y)
      })
    })

    return () => {
      destroyRef.current = true
      if (svgRef.current) d3?.select(svgRef.current).selectAll("*").remove()
    }
  }, [data, selectedNodeId, colorForNode, sizeScale, onNodeClick, resolvedTheme])

  return (
    <svg
      ref={svgRef}
      className={className ?? "w-full h-full"}
      style={{ minHeight: 400 }}
    />
  )
}
