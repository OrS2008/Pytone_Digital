variable "regions" {
  type        = list(string)
  description = "AWS regions to deploy into."
  default     = ["eu-west-1", "us-east-1", "ap-southeast-1"]
}

variable "environment" {
  type        = string
  description = "prod | staging | dev"
}

variable "cluster_size_small" {
  type    = number
  default = 6
}

variable "cluster_size_large" {
  type    = number
  default = 24
}

variable "cloudflare_zone_id" {
  type      = string
  sensitive = true
}
