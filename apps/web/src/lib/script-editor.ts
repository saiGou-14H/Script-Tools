export function initialEditorFile(files: Record<string, string>) {
  try {
    const manifest = JSON.parse(files["manifest.json"] || "{}");
    if (
      manifest &&
      typeof manifest.entrypoint === "string" &&
      Object.hasOwn(files, manifest.entrypoint)
    ) {
      return manifest.entrypoint;
    }
  } catch {
    // Keep malformed manifests available for editing.
  }
  return Object.keys(files)[0] || "main.py";
}
