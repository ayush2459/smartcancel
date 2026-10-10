# SmartCancy AWS deployment plan

This document describes the implemented deployment template and its review gates.
It does not provision AWS resources. Do not run bootstrap or deploy commands until
account eligibility, a complete monthly estimate, and the CloudFormation diff have
been reviewed and approved.

## Current deployment status

- AWS CLI profile: `smartcancy`
- Target region: `ap-southeast-2` (Asia Pacific - Sydney)
- AWS CLI authentication was verified locally with `aws sts get-caller-identity`.
- No AWS application resources or CDK bootstrap resources have been created.
- The Launch with AWS migration service sign-in did not complete. This plan is
  prepared locally; the repository has not been uploaded to that service.
- The app remains a prototype. Execution is simulation-only, and the database
  bootstrap uses synthetic demo data.

## Proposed first deployment

The local CDK app defines this architecture. It does not run migrations
automatically and does not create resources until an explicit deployment command
is run:

1. **Frontend** - private S3 bucket with CloudFront Origin Access Control. CloudFront
   routes `/api*` to API Gateway and serves `/runtime-config.json` without caching.
2. **Sign-in** - Cognito User Pool, authorization-code flow with PKCE, refresh-token
   rotation, and no public sign-up. The browser stores tokens in cookies.
3. **API** - API Gateway HTTP API with a JWT authorizer on every `/api` route except
   `/api/health/live`. HTTP API is the lower-cost, lower-latency choice over REST API;
   the app does not need REST-only features such as API keys, built-in caching, or WAF.
   It invokes Express through the Lambda adapter.
4. **Database** - private, encrypted, single-AZ PostgreSQL RDS in one isolated subnet.
   The Lambda security group is the only allowed database client. No NAT Gateway is
   created. Single-AZ is a demo trade-off, not high availability.
5. **Credentials and logs** - RDS generates a Secrets Manager secret; CloudFormation
   injects its password as a Lambda environment value, encrypted at rest by Lambda.
   Lambda and API access logs are retained for one week. Database secret rotation
   requires updating the Lambda configuration.
6. **Database initialization** - a private, one-shot Lambda can apply the schema and
   synthetic seed to this new database. It is not invoked automatically.

The deployed site uses one browser origin, so API calls need no permissive CORS rule.
The local app remains unauthenticated unless local Cognito variables are configured;
the production API is protected by API Gateway, not by frontend-only checks.

## Cost and Free plan gate

The account currently displays USD $100 in promotional credits and says it is on
the Free plan. Credits are not a per-service guarantee and do not mean that every
AWS service is available on that plan. Availability, eligible usage, and terms
must be checked in the account before creating resources. Do not upgrade the plan
to work around a service restriction without an explicit decision.

The largest recurring cost is the PostgreSQL database, which runs while
provisioned even when nobody is using the app. Storage, backups, the generated
Secrets Manager secret, CloudFront requests/egress, API requests, Lambda, Cognito,
and CloudWatch can also contribute to cost. A complete workload-specific total
has not been prepared yet. Avoid NAT Gateway, Application Load Balancer, and
always-on Fargate for this first demo.

### Known database compute price (Sydney)

The AWS Price List API returned **USD $0.025 per hour** for an on-demand
`db.t4g.micro`, PostgreSQL, Single-AZ RDS instance in Asia Pacific (Sydney),
effective October 1, 2026. At 730 hours/month this is **USD $18.25/month for
database compute alone**. Storage, backups, monitoring, and all other services
are extra. Pricing source: [Amazon RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
and the AWS Price List API (`AmazonRDS`, `ap-southeast-2`).

You chose 24/7 availability. At that compute-only rate, the database uses about
73% of a USD $25 monthly alert threshold before storage or any other AWS service,
and USD $100 in credits would cover about 5.5 months before additional charges.
Therefore do not assume the credits will last the full 183 days shown in the
account. A monthly alert is not a hard cap. Check whether the Free plan permits
each chosen resource before creating it.

Before provisioning:

1. Check that RDS PostgreSQL, Lambda, API Gateway, Cognito, S3, CloudFront, and
   the required Lambda VPC networking
   are available to this account on its current plan in `ap-southeast-2`.
2. Build a Sydney-region estimate in the
   [AWS Pricing Calculator](https://calculator.aws/), including RDS running
   730 hours/month, storage and backups, Lambda, API Gateway, S3, CloudFront,
   Cognito, Secrets Manager, and CloudWatch.
3. Compare the estimate with the USD $100 credit balance and its expiry date.
   Credits may be exhausted before the six-month Free plan ends.
4. Check current Free plan spending alerts and controls. Treat notifications as
   warnings, not a guaranteed hard spending cap.
5. If any required service is unavailable or the estimate is unacceptable,
   stop and choose a different plan before provisioning.

## Build, review, and deployment sequence

These commands have not been run against AWS:

1. Build and synthesize locally with `npm run infra:synth`. This command builds
   the frontend and runs `cdk synth --strict`; it does not contact AWS to create
   resources.
2. Review the complete estimate and account Free plan/service eligibility before
   asking to bootstrap. The previous $25 alert is a notification, not a hard cap.
3. If approved, bootstrap only `ap-southeast-2` using profile `smartcancy`.
   Bootstrap creates deployment infrastructure (including an S3 bucket, roles,
   and an SSM parameter) and may incur small charges.
4. The first application deployment uses the default callback `http://localhost:3000/`.
   After the stack outputs `FrontendUrl`, run `cdk diff` with
   `-c cognitoCallbackUrl=https://<cloudfront-domain>/` and review it. The first
   deployment's public hosted sign-in will not work until this callback update
   is separately deployed.
5. Add invited demo users in Cognito; self-registration is disabled. Do not send
   the temporary password in chat.
6. Invoke `DatabaseBootstrapFunctionName` once with
   `{"action":"initialize"}` from the Lambda console to create the schema and
   apply synthetic demo rows. This is for the newly created, dedicated
   SmartCancy RDS database only. Never point it at FlowSense or another database.
7. Verify sign-in, authenticated API access, health checks, and five pilot
   reports. Confirm execution remains explicitly simulation-only.
8. Before teardown, export data only with approval. The CDK stack retains the
   RDS database and Cognito user pool to prevent accidental deletion; these
   retained resources continue to incur charges and require deliberate cleanup.

For CI/CD, use GitHub Actions OIDC with a narrowly scoped deployment role instead
of storing AWS access keys in GitHub secrets.
