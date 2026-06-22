// Detect which microservice changed based on the diff against origin/main.
def call() {
  def services = ['threat-ingestion','threat-analysis','intel-distribution',
                  'incident-coordination','api-gateway','dashboard-ui']
  def diff = sh(returnStdout: true,
                script: 'git diff --name-only origin/main...HEAD').trim().split('\n')
  for (svc in services) {
    if (diff.any { it.startsWith("applications/${svc}/") || it.startsWith("docker/${svc}/") }) {
      return svc
    }
  }
  error 'No service changes detected — set the SERVICE parameter explicitly.'
}
