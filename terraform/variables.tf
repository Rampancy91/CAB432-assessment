variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "student_id" {
  description = "Student ID"
  type        = string
  default     = "n11676795-tf"  # Seperate stack for safety
}

variable "qut_username" {
  description = "QUT username"
  type        = string
  default     = "n11676795@qut.edu.au"
}

variable "domain_name" {
  description = "Domain name"
  type        = string
  default     = "11676795.cab432.com"
}

variable "hosted_zone_id" {
  description = "Route53 Hosted Zone ID"
  type        = string
  default     = "Z02680423BHWEVRU2JZDQ"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
  default     = "vpc-007bab53289655834"
}

variable "public_subnet_ids" {
  description = "Public subnet IDs"
  type        = list(string)
  default     = ["subnet-075811427d5564cf9", "subnet-05a3b8177138c8b14", "subnet-04ca053dcbe5f49cc"]
}

variable "security_group_id" {
  description = "Security group ID (CAB432SG)"
  type        = string
  default     = "sg-032bd1ff8cf77dbb9"
}

variable "ec2_instance_id" {
  description = "EC2 instance ID for ALB target"
  type        = string
  default     = "i-06d138b0335882e7d"
}

variable "certificate_arn" {
  description = "ACM Certificate ARN"
  type        = string
  default     = "arn:aws:acm:ap-southeast-2:901444280953:certificate/d9bbedb1-ceb7-4e9a-b75d-13118c55d485"
}