// Append an immutable audit record for every pipeline run to the WORM S3 bucket.
def call(Map cfg) {
  def record = [
    timestamp:  new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone('UTC')),
    pipeline:   env.JOB_NAME,
    build:      env.BUILD_NUMBER,
    service:    cfg.service,
    image_tag:  cfg.tag,
    git_commit: env.GIT_COMMIT,
    user:       env.BUILD_USER ?: 'jenkins',
    status:     cfg.status,
    url:        env.BUILD_URL,
  ]
  def json = groovy.json.JsonOutput.toJson(record)
  def file = "audit-${env.BUILD_NUMBER}-${cfg.service}.json"
  writeFile file: file, text: json
  sh "aws s3 cp ${file} s3://sentinelgrid-primary-audit/pipelines/${env.JOB_NAME}/${file} --sse aws:kms"
}
