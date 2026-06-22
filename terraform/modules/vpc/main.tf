## VPC module — 3-AZ VPC with public, private-app, private-data subnets,
## NAT GWs (one per AZ for resilience), VPC endpoints, Flow Logs.

variable "name"        { type = string }
variable "cidr"        { type = string }
variable "azs"         { type = list(string) }
variable "tags"        { type = map(string) default = {} }

locals {
  public_subnets  = [for i, az in var.azs : cidrsubnet(var.cidr, 8, i)]
  app_subnets     = [for i, az in var.azs : cidrsubnet(var.cidr, 8, i + 10)]
  data_subnets    = [for i, az in var.azs : cidrsubnet(var.cidr, 8, i + 20)]
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(var.tags, { Name = var.name })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false
  tags = merge(var.tags, {
    Name                          = "${var.name}-public-${var.azs[count.index]}"
    "kubernetes.io/role/elb"      = "1"
  })
}

resource "aws_subnet" "app" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.app_subnets[count.index]
  availability_zone = var.azs[count.index]
  tags = merge(var.tags, {
    Name                                  = "${var.name}-app-${var.azs[count.index]}"
    "kubernetes.io/role/internal-elb"     = "1"
  })
}

resource "aws_subnet" "data" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.data_subnets[count.index]
  availability_zone = var.azs[count.index]
  tags              = merge(var.tags, { Name = "${var.name}-data-${var.azs[count.index]}" })
}

resource "aws_eip" "nat" {
  count  = length(var.azs)
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-nat-eip-${count.index}" })
}

resource "aws_nat_gateway" "this" {
  count         = length(var.azs)
  subnet_id     = aws_subnet.public[count.index].id
  allocation_id = aws_eip.nat[count.index].id
  tags          = merge(var.tags, { Name = "${var.name}-nat-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(var.tags, { Name = "${var.name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = length(var.azs)
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[count.index].id
  }
  tags = merge(var.tags, { Name = "${var.name}-private-rt-${count.index}" })
}

resource "aws_route_table_association" "app" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table_association" "data" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.data[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

## VPC Endpoints — keep AWS API traffic off the public internet
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  tags              = merge(var.tags, { Name = "${var.name}-s3-endpoint" })
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.app[*].id
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "${var.name}-ecr-api-endpoint" })
}

## VPC Flow Logs
resource "aws_flow_log" "this" {
  log_destination      = aws_cloudwatch_log_group.flow.arn
  log_destination_type = "cloud-watch-logs"
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.this.id
  iam_role_arn         = aws_iam_role.flow.arn
}

resource "aws_cloudwatch_log_group" "flow" {
  name              = "/aws/vpc/${var.name}/flow-logs"
  retention_in_days = 90
}

data "aws_region" "current" {}

output "vpc_id"             { value = aws_vpc.this.id }
output "public_subnet_ids"  { value = aws_subnet.public[*].id }
output "app_subnet_ids"     { value = aws_subnet.app[*].id }
output "data_subnet_ids"    { value = aws_subnet.data[*].id }
