export function resolveSelectedProject(projects = [], selectedProjectId = null) {
  if (!selectedProjectId) return null;
  return projects.find((project) => project.id === selectedProjectId) || null;
}
