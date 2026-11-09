import { createServerFn } from "@tanstack/react-start";

/** The live tool catalog for the public docs, so the list never drifts from what AI apps get. */
export const getDocsTools = createServerFn({ method: "GET" }).handler(async () => {
  const { toolCatalog } = await import("@/lib/mcp/local.server");
  return (await toolCatalog()).map((t) => {
    const title = t.title ?? t.name;
    const kind = !t.name.startsWith("meta_")
      ? "notes"
      : /needs your approval/i.test(title)
        ? "approval"
        : t.annotations?.readOnlyHint
          ? "read"
          : "now";
    return {
      name: t.name,
      title: title.replace(/\s*\(needs your approval\)/i, ""),
      description: t.description ?? "",
      kind: kind as "read" | "now" | "approval" | "notes",
    };
  });
});
