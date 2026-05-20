terraform {
  required_version = ">= 1.7"
  required_providers {
    aws        = { source = "hashicorp/aws",        version = "~> 5.50" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
    helm       = { source = "hashicorp/helm",       version = "~> 2.13" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.30" }
  }

  backend "s3" {
    # Use a separate remote state bucket per environment; pass via:
    #   terraform init -backend-config=envs/prod/backend.hcl
  }
}

# Multi-region topology.
#
#   regions = ["eu-west-1", "us-east-1", "ap-southeast-1"]
#
# Each region runs:
#   - one EKS cluster
#   - an Aurora Postgres serverless v2 cluster (read replicas optional)
#   - ElastiCache for Redis (Cluster mode for >10 shards)
#   - MSK for Kafka (3 brokers @ kafka.m7g.large)
#   - S3 bucket for DVR segments with Intelligent Tiering
#   - a private R2 / CloudFront fronting the segment bucket
#
# Cloudflare sits in front of the gateway with full DDoS protection, WAF,
# Argo smart routing, and Workers for edge cache rules.

module "regional" {
  for_each = toset(var.regions)
  source   = "./modules/regional"

  providers = {
    aws = aws.regional[each.key]
  }

  region              = each.key
  environment         = var.environment
  cluster_size_small  = var.cluster_size_small
  cluster_size_large  = var.cluster_size_large
  postgres_version    = "16.3"
  redis_node_count    = 6
  kafka_brokers       = 3
}

module "cdn" {
  source = "./modules/cloudflare"

  zone_id  = var.cloudflare_zone_id
  origins  = { for k, v in module.regional : k => v.gateway_lb_dns }

  enable_argo            = true
  enable_waf             = true
  edge_cache_rules_path  = "./modules/cloudflare/rules.json"
}

# Provider configuration omitted for clarity; the module folder structure
# follows Terraform conventions:
#
#   modules/regional/  -> per-region EKS + RDS + ElastiCache + MSK + S3
#   modules/cloudflare/-> DNS + WAF + Workers + edge cache rules
#   modules/observability/ -> shared monitoring stack
#
# Variables and outputs live in variables.tf / outputs.tf.
