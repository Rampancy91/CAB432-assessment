# Tags for all resources
locals {
  common_tags = {
    qut-username = var.qut_username
    purpose      = "assessment"
  }
}

# SQS Queue for video processing
resource "aws_sqs_queue" "video_processing" {
  name                       = "${var.student_id}-video-processing-queue"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600
  
  tags = local.common_tags
}

# Dead Letter Queue
resource "aws_sqs_queue" "video_processing_dlq" {
  name = "${var.student_id}-video-processing-dlq"
  
  tags = local.common_tags
}

# Configure main queue to use DLQ
resource "aws_sqs_queue_redrive_policy" "video_processing" {
  queue_url = aws_sqs_queue.video_processing.id
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.video_processing_dlq.arn
    maxReceiveCount     = 3
  })
}

# ECR Repository
resource "aws_ecr_repository" "video_worker" {
  name                 = "${var.student_id}/video-worker"
  image_tag_mutability = "MUTABLE"
  
  tags = local.common_tags
}

# CloudWatch Log Group for ECS
resource "aws_cloudwatch_log_group" "video_worker" {
  name              = "/ecs/${var.student_id}-video-worker"
  
  # Prevent Terraform from trying to delete it
  lifecycle {
    prevent_destroy = true
  }
  
  # retention_in_days = 7
  
  # tags = local.common_tags # Nil perms
}

# ECS Cluster
resource "aws_ecs_cluster" "video_processing" {
  name = "${var.student_id}-video-processing-cluster"
  
  tags = local.common_tags
}

# ECS Task Definition
resource "aws_ecs_task_definition" "video_worker" {
  family                   = "${var.student_id}-video-worker-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  task_role_arn           = "arn:aws:iam::901444280953:role/Task-Role-CAB432-ECS"
  execution_role_arn      = "arn:aws:iam::901444280953:role/Execution-Role-CAB432-ECS"
  
  container_definitions = jsonencode([
    {
      name      = "video-worker"
      image     = "${aws_ecr_repository.video_worker.repository_url}:latest"
      essential = true
      
      environment = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.video_worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
  
  tags = local.common_tags
}

# ECS Service
resource "aws_ecs_service" "video_worker" {
  name            = "${var.student_id}-video-worker-service"
  cluster         = aws_ecs_cluster.video_processing.id
  task_definition = aws_ecs_task_definition.video_worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = true
  }
  
  tags = local.common_tags
}

# Auto-scaling target
resource "aws_appautoscaling_target" "video_worker" {
  max_capacity       = 3
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.video_processing.name}/${aws_ecs_service.video_worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Auto-scaling policy
resource "aws_appautoscaling_policy" "video_worker_cpu" {
  name               = "${var.student_id}-worker-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.video_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.video_worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.video_worker.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Application Load Balancer
resource "aws_lb" "api" {
  name               = "${var.student_id}-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids
  
  tags = local.common_tags
}

# Target Group
resource "aws_lb_target_group" "api" {
  name     = "${var.student_id}-api-targets"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  
  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
  }
  
  tags = local.common_tags
}

# Register EC2 instance with target group
resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = var.ec2_instance_id
  port             = 3000
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.certificate_arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = "80"
  protocol          = "HTTP"
  
  default_action {
    type = "redirect"
    
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Listener Rules for path-based routing
resource "aws_lb_listener_rule" "api_routes" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 1
  
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  
  condition {
    path_pattern {
      values = ["/health", "/api/auth/*", "/api/videos/*", "/api/process/*"]
    }
  }
}

# Route53 Record - Commented out to avoid conflict
# resource "aws_route53_record" "api" {
#   zone_id = var.hosted_zone_id
#   name    = var.domain_name
#   type    = "A"
#   
#   alias {
#     name                   = aws_lb.api.dns_name
#     zone_id                = aws_lb.api.zone_id
#     evaluate_target_health = true
#   }
# }

# SSM Parameters
resource "aws_ssm_parameter" "queue_url" {
  name  = "/${var.student_id}/video-processor/queue-url"
  type  = "String"
  value = aws_sqs_queue.video_processing.url
  
  tags = local.common_tags
}

resource "aws_ssm_parameter" "dlq_url" {
  name  = "/${var.student_id}/video-processor/dlq-url"
  type  = "String"
  value = aws_sqs_queue.video_processing_dlq.url
  
  tags = local.common_tags
}