output "sqs_queue_url" {
  description = "SQS Queue URL"
  value       = aws_sqs_queue.video_processing.url
}

output "dlq_url" {
  description = "Dead Letter Queue URL"
  value       = aws_sqs_queue.video_processing_dlq.url
}

output "ecr_repository_url" {
  description = "ECR Repository URL"
  value       = aws_ecr_repository.video_worker.repository_url
}

output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.video_processing.name
}

output "alb_dns_name" {
  description = "ALB DNS Name"
  value       = aws_lb.api.dns_name
}

output "domain_url" {
  description = "Application URL"
  value       = "https://${var.domain_name}"
}